import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { OTP_TTL_SECONDS, OtpChallengeService } from './otp-challenge.service';
import { OtpChannel } from './otp-channel';
import { OtpPurpose } from './otp-purpose';
import {
  EMAIL_SERVICE,
  IEmailService,
  IRedisService,
  REDIS_SERVICE,
  ISmsOtpSender,
  SMS_OTP_SENDER,
  maskEmail,
  maskPhone,
  normalizeIndianMobile,
  toIndianE164,
} from '../../../shared';
import { EMAIL_TEMPLATE_SERVICE, IEmailTemplateService } from '../../notifications';
import { IUsersRepository, User, USERS_REPOSITORY } from '../../users';
import { SendOtpResponseModel, VerificationStatusResponseModel } from '../models';
import { SignupCodes } from './signup-codes';

const RESEND_COOLDOWN_SECONDS = 30;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_SECONDS = 30 * 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Sends and checks the one-time codes for email and mobile verification. Email codes go out
 * through Resend, SMS codes through StartMessaging; neither code is ever stored.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly challenges: OtpChallengeService,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(SMS_OTP_SENDER) private readonly sms: ISmsOtpSender,
    @Inject(EMAIL_SERVICE) private readonly emailService: IEmailService,
    @Inject(EMAIL_TEMPLATE_SERVICE) private readonly emailTemplates: IEmailTemplateService,
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    @InjectPinoLogger(VerificationService.name) private readonly logger: PinoLogger,
  ) {}

  /** Before an account exists: the sign-up form asks for codes for its email and mobile. */
  async sendSignupCode(channel: OtpChannel, rawTarget: string): Promise<SendOtpResponseModel> {
    if (channel === 'email') {
      const email = this.requireEmail(rawTarget);
      const existing = await this.usersRepo.findByEmail(email);
      if (existing) {
        throw new ConflictException(
          existing.isGoogleUser
            ? 'This email is already registered with Google Sign-In. Please sign in with Google.'
            : 'An account with this email already exists. Please log in instead.',
        );
      }
      return this.send('email', email, 'signup', undefined, 'there');
    }
    const phone = this.requirePhone(rawTarget);
    await this.assertPhoneAvailable(phone);
    return this.send('phone', phone, 'signup');
  }

  /** Checks both sign-up codes together; nothing is consumed unless both are right. */
  async verifySignupCodes(input: SignupCodes): Promise<{ email: string; phoneNumber: string }> {
    const email = this.requireEmail(input.email);
    const phoneNumber = this.requirePhone(input.phoneNumber);
    if (!input.emailChallenge || !input.emailCode) {
      throw new BadRequestException('Enter the code sent to your email.');
    }
    if (!input.phoneChallenge || !input.phoneCode) {
      throw new BadRequestException('Enter the code sent to your mobile number.');
    }
    await this.assertPhoneAvailable(phoneNumber);
    await this.challenges.verifyAll([
      {
        challengeToken: input.emailChallenge,
        code: input.emailCode,
        expectation: { channel: 'email', target: email, purpose: 'signup' },
      },
      {
        challengeToken: input.phoneChallenge,
        code: input.phoneCode,
        expectation: { channel: 'phone', target: phoneNumber, purpose: 'signup' },
      },
    ]);
    return { email, phoneNumber };
  }

  /** Signed-in user (Account → Verify): email uses the account email, phone uses the given number. */
  async sendAccountCode(userId: string, channel: OtpChannel, rawTarget?: string): Promise<SendOtpResponseModel> {
    const user = await this.requireUser(userId);
    if (channel === 'email') {
      if (user.isEmailVerified) throw new BadRequestException('Your email is already verified.');
      return this.send('email', this.requireEmail(user.email), 'account', user.id, this.displayName(user));
    }
    const phone = this.requirePhone(rawTarget ?? user.phoneNumber);
    if (user.isPhoneVerified && normalizeIndianMobile(user.phoneNumber) === phone) {
      throw new BadRequestException('This mobile number is already verified.');
    }
    await this.assertPhoneAvailable(phone, user.id);
    return this.send('phone', phone, 'account', user.id);
  }

  async verifyAccountCode(
    userId: string,
    channel: OtpChannel,
    challengeToken: string,
    code: string,
    rawTarget?: string,
  ): Promise<VerificationStatusResponseModel> {
    const user = await this.requireUser(userId);
    const now = new Date();
    if (channel === 'email') {
      const email = this.requireEmail(user.email);
      await this.challenges.verify(challengeToken, code, {
        channel: 'email',
        target: email,
        purpose: 'account',
        userId,
      });
      await this.usersRepo.update(user.id, { isEmailVerified: true, emailVerifiedAt: now });
    } else {
      const phone = this.requirePhone(rawTarget ?? user.phoneNumber);
      await this.assertPhoneAvailable(phone, user.id);
      await this.challenges.verify(challengeToken, code, {
        channel: 'phone',
        target: phone,
        purpose: 'account',
        userId,
      });
      try {
        await this.usersRepo.update(user.id, {
          phoneNumber: phone,
          isPhoneVerified: true,
          phoneVerifiedAt: now,
          phoneVerificationRequired: false,
        });
      } catch (err) {
        if (isVerifiedPhoneUniqueViolation(err)) {
          throw new ConflictException('This mobile number is already registered with another account.');
        }
        throw err;
      }
    }
    return this.getStatus(user.id);
  }

  async getStatus(userId: string): Promise<VerificationStatusResponseModel> {
    const user = await this.requireUser(userId);
    return {
      email: user.email,
      isEmailVerified: !!user.isEmailVerified,
      phoneNumber: user.phoneNumber ?? null,
      isPhoneVerified: !!user.isPhoneVerified,
      phoneVerificationRequired: !!user.phoneVerificationRequired && !user.isPhoneVerified,
    };
  }

  async assertPhoneAvailable(phone: string, exceptUserId?: string): Promise<void> {
    const owner = await this.usersRepo.findByVerifiedPhone(phone);
    if (owner?.id && owner.id !== exceptUserId) {
      throw new ConflictException('This mobile number is already registered with another account.');
    }
  }

  requirePhone(raw: string | null | undefined): string {
    const phone = normalizeIndianMobile(raw);
    if (!phone) throw new BadRequestException('Please enter a valid 10-digit Indian mobile number.');
    return phone;
  }

  private requireEmail(raw: string | null | undefined): string {
    const email = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (!EMAIL_REGEX.test(email)) throw new BadRequestException('Please enter a valid email address.');
    return email;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private displayName(user: User): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'there';
  }

  private async send(
    channel: OtpChannel,
    target: string,
    purpose: OtpPurpose,
    userId?: string,
    userName = 'there',
  ): Promise<SendOtpResponseModel> {
    await this.enforceSendLimits(channel, target);
    const issued = await this.challenges.issue({ channel, target, purpose, userId });
    const minutes = Math.round(OTP_TTL_SECONDS / 60);

    if (channel === 'phone') {
      await this.sms.sendOtp(toIndianE164(target), issued.code, minutes);
    } else {
      const html = this.emailTemplates.renderEmailVerification({
        userName,
        code: issued.code,
        expiresMinutes: minutes,
      });
      await this.emailService.sendEmail({
        to: target,
        subject: `${issued.code} is your ByajBazaar verification code`,
        body: html,
        isHtml: true,
      });
    }
    this.logger.info({ channel, purpose, userId }, 'Verification code sent');

    return {
      challengeToken: issued.challengeToken,
      expiresAt: issued.expiresAt,
      resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
      maskedTarget: channel === 'phone' ? maskPhone(target) : maskEmail(target),
    };
  }

  /** 30 s between codes and at most 5 per 30 minutes for each email / number. */
  private async enforceSendLimits(channel: OtpChannel, target: string): Promise<void> {
    if (!this.redis.isEnabled()) return;
    const cooldownKey = `otp:cooldown:${channel}:${target}`;
    if (await this.redis.getAsync<number>(cooldownKey)) {
      const ttl = await this.redis.getKeyExpirationTimeAsync(cooldownKey);
      throw new HttpException(
        `Please wait ${ttl > 0 ? ttl : RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const countKey = `otp:count:${channel}:${target}`;
    const sent = (await this.redis.getAsync<number>(countKey)) ?? 0;
    if (sent >= MAX_SENDS_PER_WINDOW) {
      throw new HttpException(
        'Too many codes requested. Please try again in 30 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const windowLeft = sent > 0 ? await this.redis.getKeyExpirationTimeAsync(countKey) : SEND_WINDOW_SECONDS;
    await this.redis.setAsync(countKey, sent + 1, windowLeft > 0 ? windowLeft : SEND_WINDOW_SECONDS);
    await this.redis.setAsync(cooldownKey, 1, RESEND_COOLDOWN_SECONDS);
  }
}

export function isVerifiedPhoneUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; driverError?: { code?: string; constraint?: string } };
  const code = e?.code ?? e?.driverError?.code;
  const constraint = e?.constraint ?? e?.driverError?.constraint;
  return code === '23505' && (!constraint || constraint === 'UQ_users_verified_phone');
}
