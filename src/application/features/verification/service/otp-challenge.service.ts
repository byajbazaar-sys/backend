import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { UsersAuthOptions } from '@shared-libs';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IRedisService, REDIS_SERVICE } from '../../../shared/services/i-redis.service';

export type OtpChannel = 'email' | 'phone';
export type OtpPurpose = 'signup' | 'account';

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;
const ATTEMPTS_PREFIX = 'otp:attempts:';

interface ChallengeClaims {
  v: 1;
  id: string;
  ch: OtpChannel;
  /** Normalised target: lower-case email or 10-digit mobile. */
  t: string;
  p: OtpPurpose;
  /** Bound user for account verification. */
  u?: string;
  exp: number;
}

export interface IssuedChallenge {
  code: string;
  challengeToken: string;
  expiresAt: Date;
}

export interface ChallengeExpectation {
  channel: OtpChannel;
  target: string;
  purpose: OtpPurpose;
  userId?: string;
}

/**
 * One-time codes without storing them. The challenge token the client holds is
 * `base64url(claims).HMAC(key, claims + code)`: only someone who knows the code can reproduce the
 * signature, so the code never needs to be saved anywhere. Redis keeps just the challenge id and
 * remaining attempts (no code), which limits guessing and makes each challenge single-use.
 */
@Injectable()
export class OtpChallengeService {
  private readonly key: Buffer;

  constructor(
    authOptions: UsersAuthOptions,
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    @InjectPinoLogger(OtpChallengeService.name) private readonly logger: PinoLogger,
  ) {
    const base = process.env.OTP_SECRET?.trim() || authOptions.secret;
    // Separate key from the JWT secret so an OTP signature can never pass as a JWT signature.
    this.key = createHmac('sha256', base).update('byajbazaar-otp-v1').digest();
  }

  async issue(expectation: ChallengeExpectation): Promise<IssuedChallenge> {
    const code = randomInt(0, 10 ** CODE_LENGTH)
      .toString()
      .padStart(CODE_LENGTH, '0');
    const exp = Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS;
    const claims: ChallengeClaims = {
      v: 1,
      id: randomUUID(),
      ch: expectation.channel,
      t: expectation.target,
      p: expectation.purpose,
      ...(expectation.userId ? { u: expectation.userId } : {}),
      exp,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const challengeToken = `${payload}.${this.sign(payload, code)}`;
    if (this.redis.isEnabled()) {
      await this.redis.setAsync(`${ATTEMPTS_PREFIX}${claims.id}`, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS);
    } else {
      this.logger.warn('Redis is disabled: OTP attempts are not limited and codes can be reused until expiry');
    }
    return { code, challengeToken, expiresAt: new Date(exp * 1000) };
  }

  /** Checks and consumes one challenge. */
  async verify(challengeToken: string, code: string, expectation: ChallengeExpectation): Promise<void> {
    await this.verifyAll([{ challengeToken, code, expectation }]);
  }

  /**
   * Checks every challenge first and consumes them only when all are right, so a wrong mobile
   * code doesn't burn an email code that was entered correctly.
   */
  async verifyAll(items: { challengeToken: string; code: string; expectation: ChallengeExpectation }[]): Promise<void> {
    const ids: { id: string; label: string }[] = [];
    for (const item of items) {
      ids.push(await this.check(item.challengeToken, item.code, item.expectation));
    }
    if (!this.redis.isEnabled()) return;
    for (const { id, label } of ids) {
      // Single use: whoever deletes the key first wins.
      const taken = await this.redis.takeAsync<number>(`${ATTEMPTS_PREFIX}${id}`);
      if (taken === null || taken === undefined) {
        throw new BadRequestException(`This code for your ${label} was already used. Please request a new one.`);
      }
    }
  }

  /** Throws a user-facing BadRequest unless `code` is right; returns the challenge id. */
  private async check(
    challengeToken: string,
    code: string,
    expectation: ChallengeExpectation,
  ): Promise<{ id: string; label: string }> {
    const label = expectation.channel === 'email' ? 'email' : 'mobile number';
    const [payload, signature] = String(challengeToken ?? '').split('.');
    let claims: ChallengeClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ChallengeClaims;
    } catch {
      throw new BadRequestException(`Please request a new code for your ${label}.`);
    }
    if (
      claims?.v !== 1 ||
      !signature ||
      claims.ch !== expectation.channel ||
      claims.t !== expectation.target ||
      claims.p !== expectation.purpose ||
      (expectation.userId && claims.u !== expectation.userId)
    ) {
      throw new BadRequestException(`This code was sent to a different ${label}. Please request a new code.`);
    }
    const remainingSeconds = claims.exp - Math.floor(Date.now() / 1000);
    if (remainingSeconds <= 0) {
      throw new BadRequestException(`The code for your ${label} has expired. Please request a new one.`);
    }

    const attemptsKey = `${ATTEMPTS_PREFIX}${claims.id}`;
    let attemptsLeft: number | null = null;
    if (this.redis.isEnabled()) {
      attemptsLeft = await this.redis.getAsync<number>(attemptsKey);
      if (attemptsLeft === null || attemptsLeft === undefined || attemptsLeft <= 0) {
        throw new BadRequestException(`This code for your ${label} can no longer be used. Please request a new one.`);
      }
    }

    const normalisedCode = String(code ?? '').replace(/\D/g, '');
    const expected = Buffer.from(this.sign(payload, normalisedCode));
    const actual = Buffer.from(signature);
    const matches =
      normalisedCode.length === CODE_LENGTH && expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!matches) {
      if (attemptsLeft !== null && attemptsLeft !== undefined) {
        const next = attemptsLeft - 1;
        if (next <= 0) await this.redis.deleteAsync(attemptsKey);
        else await this.redis.setAsync(attemptsKey, next, remainingSeconds);
        throw new BadRequestException(
          next <= 0
            ? `Too many wrong attempts for your ${label}. Please request a new code.`
            : `Wrong code for your ${label}. ${next} ${next === 1 ? 'attempt' : 'attempts'} left.`,
        );
      }
      throw new BadRequestException(`Wrong code for your ${label}.`);
    }
    return { id: claims.id, label };
  }

  private sign(payload: string, code: string): string {
    return createHmac('sha256', this.key).update(`${payload}.${code}`).digest('base64url');
  }
}
