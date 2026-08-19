import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { GoogleSsoRequestModel } from '../../application/features/auth/models';
import { AppIntegrityOptions } from '../../application/shared/options/app-integrity.options';
import {
  AppIntegrityChallengeResult,
  IAppIntegrityService,
} from '../../application/shared/services/i-app-integrity.service';
import { IRedisService, REDIS_SERVICE } from '../../application/shared/services/i-redis.service';

const CHALLENGE_TTL_SECONDS = 300;
const CHALLENGE_PREFIX = 'app-integrity:challenge:';
const ATTEST_PREFIX = 'app-integrity:attest:';
const ATTEST_TTL_SECONDS = 60 * 60 * 24 * 180;

type StoredAttestation = {
  publicKey: string;
  signCount: number;
};

@Injectable()
export class AppIntegrityService implements IAppIntegrityService {
  private serviceAccountCredentialsCache: Record<string, unknown> | null | undefined;

  constructor(
    private readonly options: AppIntegrityOptions,
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    @InjectPinoLogger(AppIntegrityService.name) private readonly logger: PinoLogger,
  ) {}

  async createChallenge(): Promise<AppIntegrityChallengeResult> {
    if (!this.redis.isEnabled()) {
      throw new BadRequestException('App integrity is unavailable');
    }
    const challenge = randomBytes(32).toString('base64url');
    await this.redis.setAsync(`${CHALLENGE_PREFIX}${challenge}`, '1', CHALLENGE_TTL_SECONDS);
    return { challenge, expiresInSeconds: CHALLENGE_TTL_SECONDS };
  }

  /**
   * Web `authCode` logins never call this.
   * Native `idToken` logins must present a one-time Play Integrity token or App Attest proof.
   */
  async verifyMobileGoogleSso(request: GoogleSsoRequestModel): Promise<void> {
    const hasAndroid = Boolean(request.integrityToken);
    const hasIos = Boolean(request.integrityKeyId && (request.integrityAttestation || request.integrityAssertion));

    if (!hasAndroid && !hasIos) {
      throw new ForbiddenException('App integrity verification is required');
    }
    if (hasAndroid && hasIos) {
      throw new ForbiddenException('Invalid app integrity payload');
    }
    if (!request.integrityChallenge) {
      throw new ForbiddenException('App integrity challenge is required');
    }

    await this.consumeChallenge(request.integrityChallenge);

    if (hasAndroid) {
      await this.verifyAndroidToken(request.integrityToken!, request.integrityChallenge);
      return;
    }

    if (request.integrityAttestation) {
      await this.registerIosAttestation(
        request.integrityKeyId!,
        request.integrityAttestation,
        request.integrityChallenge,
      );
      return;
    }

    await this.verifyIosAssertion(request.integrityKeyId!, request.integrityAssertion!, request.integrityChallenge);
  }

  private async consumeChallenge(challenge: string): Promise<void> {
    if (!this.redis.isEnabled()) {
      throw new ForbiddenException('App integrity is unavailable');
    }
    const consumed = await this.redis.takeAsync<string>(`${CHALLENGE_PREFIX}${challenge}`);
    if (!consumed) {
      throw new ForbiddenException('Invalid or expired integrity challenge');
    }
  }

  private buildRequestHash(challenge: string): string {
    return createHash('sha256').update(`google-sso:${challenge}`).digest('base64');
  }

  private hashesMatch(actual: string | undefined, expected: string): boolean {
    if (!actual) return false;
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async resolveServiceAccountCredentials(): Promise<Record<string, unknown>> {
    if (this.serviceAccountCredentialsCache !== undefined) {
      if (!this.serviceAccountCredentialsCache) {
        throw new ForbiddenException('Play Integrity is not configured');
      }
      return this.serviceAccountCredentialsCache;
    }

    if (this.options.serviceAccountJson) {
      try {
        this.serviceAccountCredentialsCache = JSON.parse(this.options.serviceAccountJson) as Record<
          string,
          unknown
        >;
        return this.serviceAccountCredentialsCache;
      } catch {
        this.serviceAccountCredentialsCache = null;
        throw new ForbiddenException('Play Integrity is not configured');
      }
    }

    if (this.options.serviceAccountSsmPath) {
      try {
        const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
        const response = await new SSMClient({}).send(
          new GetParameterCommand({
            Name: this.options.serviceAccountSsmPath,
            WithDecryption: true,
          }),
        );
        this.serviceAccountCredentialsCache = JSON.parse(response.Parameter?.Value ?? '') as Record<
          string,
          unknown
        >;
        return this.serviceAccountCredentialsCache;
      } catch (error) {
        this.logger.warn({ error }, 'Failed to load Play Integrity service account from SSM');
        this.serviceAccountCredentialsCache = null;
        throw new ForbiddenException('Play Integrity is not configured');
      }
    }

    this.serviceAccountCredentialsCache = null;
    throw new ForbiddenException('Play Integrity is not configured');
  }

  private async verifyAndroidToken(token: string, challenge: string): Promise<void> {
    if (!this.options.playIntegrityReady) {
      throw new ForbiddenException('Play Integrity is not configured');
    }

    const credentials = await this.resolveServiceAccountCredentials();

    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/playintegrity'],
    });

    const client = await auth.getClient();
    let payload:
      | {
          requestDetails?: { requestHash?: string };
          appIntegrity?: { appRecognitionVerdict?: string; packageName?: string };
          deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
        }
      | undefined;

    try {
      const response = await client.request<{
        tokenPayloadExternal?: {
          requestDetails?: { requestHash?: string };
          appIntegrity?: { appRecognitionVerdict?: string; packageName?: string };
          deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
        };
      }>({
        url: `https://playintegrity.googleapis.com/v1/${this.options.androidPackageName}:decodeIntegrityToken`,
        method: 'POST',
        data: { integrityToken: token },
      });
      payload = response.data?.tokenPayloadExternal;
    } catch (error) {
      this.logger.warn({ error }, 'Play Integrity decode failed');
      throw new ForbiddenException('Invalid Play Integrity token');
    }

    if (!payload) {
      throw new ForbiddenException('Invalid Play Integrity token');
    }

    if (!this.hashesMatch(payload.requestDetails?.requestHash, this.buildRequestHash(challenge))) {
      throw new ForbiddenException('Play Integrity request hash mismatch');
    }

    if (payload.appIntegrity?.packageName !== this.options.androidPackageName) {
      throw new ForbiddenException('Play Integrity package name mismatch');
    }

    const appVerdict = payload.appIntegrity?.appRecognitionVerdict;
    const appOk =
      appVerdict === 'PLAY_RECOGNIZED' ||
      (this.options.allowDevelopmentEnvironment &&
        (appVerdict === 'UNRECOGNIZED_VERSION' || appVerdict === 'UNEVALUATED'));
    if (!appOk) {
      throw new ForbiddenException('App is not Play-recognized');
    }

    const deviceVerdicts = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    const deviceOk =
      deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY') ||
      deviceVerdicts.includes('MEETS_STRONG_INTEGRITY') ||
      (this.options.allowDevelopmentEnvironment && deviceVerdicts.includes('MEETS_BASIC_INTEGRITY'));
    if (!deviceOk) {
      throw new ForbiddenException('Device integrity check failed');
    }
  }

  private attestKey(keyId: string): string {
    return `${ATTEST_PREFIX}${keyId}`;
  }

  private async registerIosAttestation(keyId: string, attestation: string, challenge: string): Promise<void> {
    if (!this.options.appAttestReady) {
      throw new ForbiddenException('App Attest is not configured');
    }

    try {
      const { verifyAttestation } = await import('node-app-attest');
      const result = verifyAttestation({
        attestation: Buffer.from(attestation, 'base64'),
        challenge,
        keyId,
        bundleIdentifier: this.options.appleBundleId,
        teamIdentifier: this.options.appleTeamId,
        allowDevelopmentEnvironment: this.options.allowDevelopmentEnvironment,
      });

      if (!this.redis.isEnabled()) {
        throw new ForbiddenException('App Attest storage is unavailable');
      }

      await this.redis.setAsync<StoredAttestation>(
        this.attestKey(keyId),
        { publicKey: result.publicKey, signCount: 0 },
        ATTEST_TTL_SECONDS,
      );
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof BadRequestException) throw error;
      this.logger.warn({ error }, 'App Attest verification failed');
      throw new ForbiddenException('iOS App Attest verification failed');
    }
  }

  private async verifyIosAssertion(keyId: string, assertion: string, challenge: string): Promise<void> {
    if (!this.options.appAttestReady) {
      throw new ForbiddenException('App Attest is not configured');
    }
    if (!this.redis.isEnabled()) {
      throw new ForbiddenException('App Attest storage is unavailable');
    }

    const stored = await this.redis.getAsync<StoredAttestation>(this.attestKey(keyId));
    if (!stored) {
      throw new ForbiddenException('App Attest key is not registered');
    }

    try {
      const { verifyAssertion } = await import('node-app-attest');
      const result = verifyAssertion({
        assertion: Buffer.from(assertion, 'base64'),
        payload: JSON.stringify({ action: 'google-sso', challenge }),
        publicKey: stored.publicKey,
        bundleIdentifier: this.options.appleBundleId,
        teamIdentifier: this.options.appleTeamId,
        signCount: stored.signCount,
      });

      await this.redis.setAsync<StoredAttestation>(
        this.attestKey(keyId),
        { publicKey: stored.publicKey, signCount: result.signCount },
        ATTEST_TTL_SECONDS,
      );
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof BadRequestException) throw error;
      this.logger.warn({ error }, 'App Attest assertion failed');
      throw new ForbiddenException('iOS App Attest assertion failed');
    }
  }
}
