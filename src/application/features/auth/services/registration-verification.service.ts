import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { UsersAuthOptions } from '@shared-libs';
import { createHash, randomInt } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IRegistrationVerificationService } from './i-registration-verification.service';
import { STARTMESSAGING_SERVICE, IStartMessagingService } from './i-startmessaging.service';
import { EMAIL_SERVICE, IEmailService, IRedisService, REDIS_SERVICE } from '../../../shared';
import { WebAppOptions } from '../../../shared/options';
import { IEmailTemplateService, EMAIL_TEMPLATE_SERVICE } from '../../notifications';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import {
  RegistrationEmailSendResult,
  RegistrationEmailVerificationResult,
  RegistrationPhoneOtpSendResult,
  RegistrationPhoneOtpVerifyResult,
  RegistrationVerificationClaims,
  REGISTRATION_EMAIL_VERIFICATION_PURPOSE,
  REGISTRATION_PHONE_CHALLENGE_PURPOSE,
  REGISTRATION_PHONE_VERIFICATION_PURPOSE,
} from '../domain/registration-verification';

const EMAIL_SEND_WINDOW_SECONDS = 15 * 60;
const PHONE_SEND_COOLDOWN_SECONDS = 60;
const PHONE_SEND_DAILY_WINDOW_SECONDS = 24 * 60 * 60;
const PHONE_CHALLENGE_TTL_SECONDS = 5 * 60;
const VERIFICATION_PROOF_TTL_SECONDS = 30 * 60;
const OTP_CODE_PATTERN = /^\d{6}$/;

@Injectable()
export class RegistrationVerificationService implements IRegistrationVerificationService {
  constructor(
    private readonly jwtService: JwtService,
    protected readonly authOptions: UsersAuthOptions,
    private readonly webAppOptions: WebAppOptions,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(EMAIL_SERVICE) private readonly emailService: IEmailService,
    @Inject(EMAIL_TEMPLATE_SERVICE) private readonly emailTemplateService: IEmailTemplateService,
    @Inject(STARTMESSAGING_SERVICE) private readonly startMessaging: IStartMessagingService,
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    @InjectPinoLogger(RegistrationVerificationService.name) private readonly logger: PinoLogger,
  ) {}

  async sendRegistrationEmailVerification(email: string): Promise<RegistrationEmailSendResult> {
    const normalizedEmail = this.normalizeEmail(email);
    await this.consumeLimit(`registration-email:${normalizedEmail}`, 3, EMAIL_SEND_WINDOW_SECONDS);

    const existingUser = await this.usersRepo.findByEmail(normalizedEmail);
    if (!existingUser) {
      const emailVerificationToken = await this.jwtService.signAsync(
        {
          sub: normalizedEmail,
          purpose: REGISTRATION_EMAIL_VERIFICATION_PURPOSE,
        },
        this.tokenSignOptions(VERIFICATION_PROOF_TTL_SECONDS),
      );
      const verificationUrl = this.webAppOptions.buildRegistrationEmailVerificationUrl(emailVerificationToken);
      const html = this.emailTemplateService.renderEmailVerification({
        userName: normalizedEmail,
        verificationUrl,
      });

      await this.emailService.sendEmail({
        to: normalizedEmail,
        subject: 'Verify your email address',
        body: html,
        isHtml: true,
      });
    }

    return {
      message: 'If this email can be used, a verification link has been sent.',
      retryAfterSeconds: 60,
    };
  }

  async verifyRegistrationEmail(token: string): Promise<RegistrationEmailVerificationResult> {
    const claims = await this.verifyToken(token, REGISTRATION_EMAIL_VERIFICATION_PURPOSE);
    const email = this.normalizeEmail(claims.sub);
    if (!claims.exp) {
      throw new BadRequestException('Invalid or expired email verification link');
    }
    return { email, emailVerificationToken: token, expiresAt: claims.exp };
  }

  async sendRegistrationPhoneOtp(phoneNumber: string): Promise<RegistrationPhoneOtpSendResult> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    await this.consumeLimit(`registration-phone-send-minute:${normalizedPhone}`, 1, PHONE_SEND_COOLDOWN_SECONDS);
    await this.consumeLimit(`registration-phone-send-day:${normalizedPhone}`, 5, PHONE_SEND_DAILY_WINDOW_SECONDS);

    const otp = String(randomInt(100_000, 1_000_000));
    let requestId: string;
    try {
      requestId = await this.startMessaging.sendOtp(normalizedPhone, otp);
    } catch (error) {
      this.logger.warn(
        {
          phoneNumberHash: this.hashKey(normalizedPhone),
          status: error instanceof HttpException ? error.getStatus() : undefined,
        },
        'StartMessaging OTP send failed',
      );
      throw error;
    }

    const challengeToken = await this.jwtService.signAsync(
      {
        sub: normalizedPhone,
        phoneNumber: normalizedPhone,
        requestId,
        purpose: REGISTRATION_PHONE_CHALLENGE_PURPOSE,
      },
      this.tokenSignOptions(PHONE_CHALLENGE_TTL_SECONDS),
    );

    return {
      challengeToken,
      expiresInSeconds: PHONE_CHALLENGE_TTL_SECONDS,
      retryAfterSeconds: PHONE_SEND_COOLDOWN_SECONDS,
    };
  }

  async verifyRegistrationPhoneOtp(challengeToken: string, otpCode: string): Promise<RegistrationPhoneOtpVerifyResult> {
    if (!OTP_CODE_PATTERN.test(otpCode)) {
      throw new BadRequestException('OTP must be a 6-digit code');
    }
    const claims = await this.verifyToken(challengeToken, REGISTRATION_PHONE_CHALLENGE_PURPOSE);
    const phoneNumber = this.normalizePhoneNumber(claims.phoneNumber);
    if (!claims.requestId) {
      throw new BadRequestException('Invalid or expired OTP challenge');
    }

    await this.consumeLimit(`registration-phone-verify:${phoneNumber}`, 10, 10 * 60);

    if (!(await this.startMessaging.verifyOtp(claims.requestId, otpCode))) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    const phoneVerificationToken = await this.jwtService.signAsync(
      {
        sub: phoneNumber,
        phoneNumber,
        purpose: REGISTRATION_PHONE_VERIFICATION_PURPOSE,
      },
      this.tokenSignOptions(VERIFICATION_PROOF_TTL_SECONDS),
    );
    return {
      phoneVerificationToken,
      expiresInSeconds: VERIFICATION_PROOF_TTL_SECONDS,
    };
  }

  async assertEmailVerification(email: string, token: string): Promise<void> {
    const claims = await this.verifyToken(token, REGISTRATION_EMAIL_VERIFICATION_PURPOSE);
    if (this.normalizeEmail(claims.sub) !== this.normalizeEmail(email)) {
      throw new BadRequestException('Email verification does not match the submitted email address');
    }
  }

  async assertPhoneVerification(phoneNumber: string, token: string): Promise<void> {
    const claims = await this.verifyToken(token, REGISTRATION_PHONE_VERIFICATION_PURPOSE);
    if (this.normalizePhoneNumber(claims.phoneNumber ?? claims.sub) !== this.normalizePhoneNumber(phoneNumber)) {
      throw new BadRequestException('Phone verification does not match the submitted phone number');
    }
  }

  private async verifyToken(token: string, purpose: string): Promise<RegistrationVerificationClaims> {
    if (!token?.trim() || token.length > 4096) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    let claims: RegistrationVerificationClaims;
    try {
      claims = await this.jwtService.verifyAsync<RegistrationVerificationClaims>(token, {
        secret: this.authOptions.secret,
        audience: this.authOptions.audience,
        issuer: this.authOptions.issuer,
        algorithms: [this.authOptions.algorithm],
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (!claims.sub || claims.purpose !== purpose) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    return claims;
  }

  private tokenSignOptions(expiresIn: number): JwtSignOptions {
    return {
      secret: this.authOptions.secret,
      audience: this.authOptions.audience,
      issuer: this.authOptions.issuer,
      algorithm: this.authOptions.algorithm,
      expiresIn,
    };
  }

  private async consumeLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
    let result: { allowed: boolean; retryAfterSeconds: number; count: number };
    try {
      result = await this.redis.consumeRateLimitAsync(this.hashKey(key), limit, windowSeconds);
    } catch (error) {
      this.logger.error({ error }, 'Registration verification rate limiting failed');
      throw new ServiceUnavailableException('Verification is temporarily unavailable. Please try again later.');
    }
    if (!result.allowed) {
      throw new HttpException(
        {
          message: 'Too many verification attempts. Please try again later.',
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private normalizeEmail(email: string): string {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || normalized.length > 254) {
      throw new BadRequestException('Please provide a valid email address');
    }
    return normalized;
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const normalized = phoneNumber?.trim();
    if (!normalized || !/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException('Please provide a valid phone number in E.164 format');
    }
    return normalized;
  }

  private hashKey(value: string): string {
    return `auth-rate-limit:${createHash('sha256').update(value).digest('hex')}`;
  }
}
