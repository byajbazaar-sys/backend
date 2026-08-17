import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  IIdentity,
  UsersAuthOptions,
  JWT_EXPIRES_IN,
  AUTH_SCOPE_FULL,
  BCRYPT_SALT_ROUNDS,
  EUserType,
  normalizeImageBufferForStorageOrThrow,
} from '@shared-libs';
import { compareSync, hashSync } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { randomBytes } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

import { LoginResponseModel, GoogleSsoResponseModel, GoogleSsoRequestModel } from './models';
import { IUsersRepository, User, USERS_REPOSITORY } from '../users';
import { isCatalogSlugUniqueViolation, resolveCatalogSlugForBusinessName } from '../users/utils/catalog-slug.helper';
import { IAuthService } from './interfaces';
import {
  USERS_FILE_STORAGE,
  IUsersFileStorage,
  FileStorageOptions,
  WebAppOptions,
  EMAIL_SERVICE,
  IEmailService,
  IGoogleOAuthService,
  GOOGLE_OAUTH_SERVICE,
  GoogleUserInfo,
  CACHE_NAMESPACE,
  CACHE_SERVICE,
  ICacheService,
} from '../../shared';
import { EMAIL_TEMPLATE_SERVICE, IEmailTemplateService } from '../notifications';
import { IPaymentsService, PAYMENTS_SERVICE } from '../payments/service/i-payments.service';

type ResolvedUser = User & { id: string; email: string; userType: EUserType };

interface HttpLikeError {
  message?: string;
  stack?: string;
  response?: {
    status?: number;
    data?: { error?: string; error_description?: string };
  };
}

function asHttpLikeError(error: unknown): HttpLikeError {
  if (error && typeof error === 'object') {
    return error as HttpLikeError;
  }
  return { message: String(error) };
}

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly options: UsersAuthOptions,
    protected readonly fileStorageOptions: FileStorageOptions,
    private readonly webAppOptions: WebAppOptions,
    @Inject(GOOGLE_OAUTH_SERVICE) private readonly googleOAuthService: IGoogleOAuthService,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly usersFileStorage: IUsersFileStorage,
    @Inject(EMAIL_SERVICE) private readonly emailService: IEmailService,
    @Inject(EMAIL_TEMPLATE_SERVICE) private readonly emailTemplateService: IEmailTemplateService,
    @Optional() @Inject(PAYMENTS_SERVICE) private readonly paymentsService: IPaymentsService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  private requireEmail(email: string, message = 'Email is required'): string {
    const normalized = email?.toLowerCase().trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private requireResolvedUser(user: User, message = 'Invalid user record'): ResolvedUser {
    if (!user.id || !user.email || user.userType === undefined) {
      throw new UnauthorizedException(message);
    }
    return user as ResolvedUser;
  }

  private async buildAuthTokens(identity: IIdentity): Promise<{
    accessToken: string;
    paymentToken: string;
    requiresSubscription: boolean;
    subscriptionStatus: string;
    redirectPath: string;
  }> {
    const isAdmin = identity.userType === EUserType.Admin;
    let hasPremiumAccess = isAdmin;
    let subscriptionStatus: string = null;

    if (!isAdmin && this.paymentsService) {
      hasPremiumAccess = await this.paymentsService.hasAppAccess(identity.userId);
      const status = await this.paymentsService.getStatus(identity.userId);
      if (status.hasActiveSubscription) {
        subscriptionStatus = 'active';
      } else if (status.isOnTrial) {
        subscriptionStatus = 'trial';
      } else {
        subscriptionStatus = status.status ?? 'inactive';
      }
    } else if (isAdmin) {
      subscriptionStatus = 'active';
    }

    const accessToken = await this.generateJwtToken({
      ...identity,
      scope: AUTH_SCOPE_FULL,
    });

    return {
      accessToken,
      paymentToken: null,
      requiresSubscription: !hasPremiumAccess,
      subscriptionStatus,
      redirectPath: '/dashboard',
    };
  }

  async login(email: string, password: string): Promise<LoginResponseModel> {
    try {
      const user = await this.usersRepo.findByEmail(email.toLowerCase().trim());

      // User doesn't exist
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // User exists but is a Google-only user (no password set)
      if (!user.password || (typeof user.password === 'string' && user.password.trim() === '')) {
        throw new UnauthorizedException(
          'This account was created with Google Sign-In. Please use "Forgot Password" to set a password and login, or sign in with Google.',
        );
      }

      // Password doesn't match
      if (!compareSync(password, user.password)) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const resolvedUser = this.requireResolvedUser(user);
      const now = new Date();
      const wasFirstLogin = resolvedUser.isFirstLogin === true;
      await this.usersRepo.update(resolvedUser.id, { lastLoginAt: now, isFirstLogin: false });
      await this.invalidateUserDetailsCache(resolvedUser.id);

      const identity: IIdentity = {
        userId: resolvedUser.id,
        userType: resolvedUser.userType,
        email: resolvedUser.email,
        emailVerified: resolvedUser.isEmailVerified,
      };

      const tokens = await this.buildAuthTokens(identity);
      const response = plainToInstance(
        LoginResponseModel,
        {
          ...resolvedUser,
          lastLoginAt: now,
          isFirstLogin: wasFirstLogin,
          accessToken: tokens.accessToken,
          paymentToken: tokens.paymentToken,
          requiresSubscription: tokens.requiresSubscription,
          subscriptionStatus: tokens.subscriptionStatus,
          profilePhotoUrl: resolvedUser.profilePhotoRef
            ? await this.usersFileStorage.getUrlAsync(resolvedUser.profilePhotoRef)
            : null,
        },
        {
          excludeExtraneousValues: true,
        },
      );

      return response;
    } catch (err) {
      throw err;
    }
  }

  async signup(body: User): Promise<User> {
    const user = plainToInstance(User, body);
    const email = this.requireEmail(user.email);
    const existingUser = await this.usersRepo.findByEmail(email);
    if (existingUser) {
      // User exists - check if it's a Google user
      if (existingUser.isGoogleUser) {
        throw new ConflictException(
          'This email is already registered with Google Sign-In. Please sign in with Google or use "Forgot Password" to set a password.',
        );
      }
      // Regular user already exists
      throw new ConflictException('User with this email already exists');
    }

    try {
      const userId = uuidv4();
      user.id = userId;
      user.email = email;
      this.logger.debug({ userId, email: user.email }, 'Creating new user');
      if (user.profilePhoto && user.profilePhotoContentType) {
        const normalized = await normalizeImageBufferForStorageOrThrow(
          user.profilePhoto,
          user.profilePhotoContentType,
          user.profilePhotoFileName,
        );
        const proposedRef = `users/profiles/${userId}.${normalized.fileExtension}`;
        user.profilePhotoRef = await this.usersFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
        );
      }

      const emailVerificationToken = randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      let catalogSlug: string | null = null;
      if (user.businessName?.trim()) {
        catalogSlug = await resolveCatalogSlugForBusinessName(this.usersRepo, user.businessName);
      }

      let createdUser: User;
      try {
        createdUser = await this.usersRepo.create({
          ...user,
          catalogSlug,
          catalogEnabled: catalogSlug ? true : undefined,
          emailVerificationToken,
          emailVerificationExpires,
          isFirstLogin: true,
        });
      } catch (err) {
        if (isCatalogSlugUniqueViolation(err)) {
          throw new ConflictException(
            'This business name is already being used for a catalog URL. Please choose a unique business name.',
          );
        }
        throw err;
      }

      const verificationUrl = this.webAppOptions.buildVerifyEmailUrl(emailVerificationToken);
      const html = this.emailTemplateService.renderEmailVerification({
        userName: user.firstName
          ? `${user.firstName} ${user.lastName ?? ''}`.trim() || user.email
          : (user.email ?? 'User'),
        verificationUrl,
      });
      await this.emailService.sendEmail({
        to: email,
        subject: 'Verify your email address',
        body: html,
        isHtml: true,
      });

      return {
        ...createdUser,
        profilePhotoRef: user.profilePhotoRef
          ? await this.usersFileStorage.getUrlAsync(user.profilePhotoRef)
          : undefined,
      };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ConflictException) {
        throw err;
      }
      throw err;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    try {
      const user = await this.usersRepo.findByEmail(email.toLowerCase().trim());
      if (!user) {
        throw new NotFoundException('User not found');
      }
      const resolvedUser = this.requireResolvedUser(user);
      const resetPasswordToken = randomBytes(32).toString('hex');
      const resetPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.usersRepo.update(resolvedUser.id, {
        resetPasswordToken,
        resetPasswordExpires,
      });

      const resetUrl = this.webAppOptions.buildResetPasswordUrl(resetPasswordToken);
      const html = this.emailTemplateService.renderForgotPassword({
        userName: resolvedUser.firstName
          ? `${resolvedUser.firstName} ${resolvedUser.lastName ?? ''}`.trim() || resolvedUser.email
          : resolvedUser.email,
        resetUrl,
      });
      await this.emailService.sendEmail({
        to: resolvedUser.email,
        subject: 'Reset your password',
        body: html,
        isHtml: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async verifyForgotPasswordToken(token: string, newPassword: string): Promise<User> {
    try {
      const user = await this.usersRepo.findByResetPasswordToken(token);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
        throw new BadRequestException('Token expired');
      }

      const resolvedUser = this.requireResolvedUser(user);
      await this.usersRepo.update(resolvedUser.id, {
        password: hashSync(newPassword, BCRYPT_SALT_ROUNDS),
        resetPasswordToken: null,
        resetPasswordExpires: null,
      });
      return { ...resolvedUser, password: undefined };
    } catch (err) {
      throw err;
    }
  }

  async resendVerificationEmail(email: string): Promise<void> {
    try {
      const user = await this.usersRepo.findByEmail(email.toLowerCase().trim());
      if (!user) {
        throw new NotFoundException('User not found');
      }
      if (user.isEmailVerified) {
        throw new BadRequestException('Email is already verified');
      }

      const resolvedUser = this.requireResolvedUser(user);
      const emailVerificationToken = randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.usersRepo.update(resolvedUser.id, {
        emailVerificationToken,
        emailVerificationExpires,
      });

      const verificationUrl = this.webAppOptions.buildVerifyEmailUrl(emailVerificationToken);
      const html = this.emailTemplateService.renderEmailVerification({
        userName: resolvedUser.firstName
          ? `${resolvedUser.firstName} ${resolvedUser.lastName ?? ''}`.trim() || resolvedUser.email
          : resolvedUser.email,
        verificationUrl,
      });
      await this.emailService.sendEmail({
        to: resolvedUser.email,
        subject: 'Verify your email address',
        body: html,
        isHtml: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async verifyEmail(token: string): Promise<LoginResponseModel> {
    try {
      const user = await this.usersRepo.findByEmailVerificationToken(token);
      if (!user) {
        throw new NotFoundException('Invalid or expired verification token');
      }

      if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
        throw new BadRequestException('Verification token expired');
      }

      const now = new Date();
      const wasFirstLogin = user.isFirstLogin === true;
      const resolvedUser = this.requireResolvedUser(user);
      await this.usersRepo.update(resolvedUser.id, {
        isEmailVerified: true,
        emailVerifiedAt: now,
        lastLoginAt: now,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        isFirstLogin: false,
      });
      await this.invalidateUserDetailsCache(resolvedUser.id);

      const updatedUser: ResolvedUser = {
        ...resolvedUser,
        isEmailVerified: true,
        emailVerifiedAt: now,
        lastLoginAt: now,
        isFirstLogin: wasFirstLogin,
      };
      const identity: IIdentity = {
        userId: updatedUser.id,
        userType: updatedUser.userType,
        email: updatedUser.email,
        emailVerified: true,
      };
      const tokens = await this.buildAuthTokens(identity);
      const profilePhotoUrl = updatedUser.profilePhotoRef
        ? await this.usersFileStorage.getUrlAsync(updatedUser.profilePhotoRef)
        : null;

      return plainToInstance(
        LoginResponseModel,
        {
          ...updatedUser,
          accessToken: tokens.accessToken,
          paymentToken: tokens.paymentToken,
          requiresSubscription: tokens.requiresSubscription,
          subscriptionStatus: tokens.subscriptionStatus,
          profilePhotoUrl,
        },
        { excludeExtraneousValues: true },
      );
    } catch (err) {
      throw err;
    }
  }

  async googleSso(request: GoogleSsoRequestModel): Promise<GoogleSsoResponseModel> {
    try {
      let googleUser: GoogleUserInfo;
      const now = new Date();

      if (request.authCode) {
        // OAuth2 Authorization Code Flow
        const tokens = await this.googleOAuthService.exchangeCodeForTokens(request.authCode);

        // Get user info from ID token
        if (tokens.id_token) {
          googleUser = await this.googleOAuthService.getUserInfoFromIdToken(tokens.id_token);
        } else {
          throw new UnauthorizedException('No ID token received');
        }
      } else if (request.accessToken) {
        // Direct Access Token Flow (for mobile apps or other scenarios)
        googleUser = await this.googleOAuthService.getUserInfoFromIdToken(request.accessToken);
      } else {
        throw new BadRequestException('Either authCode or accessToken must be provided');
      }

      if (!googleUser.email) {
        throw new UnauthorizedException('Invalid Google token');
      }

      // Check if user exists with Google ID
      let user = await this.usersRepo.findByGoogleId(googleUser.sub);

      let isNewUser = false;

      // If not found by Google ID, check by email
      if (!user) {
        const existingUser = await this.usersRepo.findByEmail(googleUser.email.toLowerCase().trim());

        if (existingUser) {
          const linkedUser = this.requireResolvedUser(existingUser);
          // User exists with same email - link Google account to existing user
          // This allows users who registered with email/password to later use Google Sign-In
          await this.usersRepo.update(linkedUser.id, {
            googleId: googleUser.sub,
            isGoogleUser: true,
            isEmailVerified: true, // Google emails are verified
            emailVerifiedAt: linkedUser.emailVerifiedAt || now,
          });
          await this.invalidateUserDetailsCache(linkedUser.id);

          // Refresh user data
          user = await this.usersRepo.findById(linkedUser.id);
          isNewUser = false;
        }
      }

      // Create new user if not found
      if (!user) {
        const userId = uuidv4();
        user = await this.usersRepo.create({
          id: userId,
          email: googleUser.email.toLowerCase().trim(),
          firstName: googleUser.given_name || '',
          lastName: googleUser.family_name || '',
          isEmailVerified: true,
          emailVerifiedAt: now,
          userType: EUserType.User,
          googleId: googleUser.sub,
          isGoogleUser: true,
          isFirstLogin: true,
          createdAt: now,
          updatedAt: now,
          profilePhoto: Buffer.alloc(0),
          profilePhotoFileName: '',
          profilePhotoContentType: '',
        });
        isNewUser = true;
      }

      if (!user) {
        throw new BadRequestException('Failed to load user after Google sign-in');
      }

      const resolvedUser = this.requireResolvedUser(user);
      const wasFirstLogin = resolvedUser.isFirstLogin === true;
      await this.usersRepo.update(resolvedUser.id, {
        lastLoginAt: now,
        isFirstLogin: false,
      });
      await this.invalidateUserDetailsCache(resolvedUser.id);
      user = await this.usersRepo.findById(resolvedUser.id);
      if (!user) {
        throw new BadRequestException('Failed to load user after Google sign-in');
      }
      const authenticatedUser = this.requireResolvedUser(user);

      const identity: IIdentity = {
        userId: authenticatedUser.id,
        userType: authenticatedUser.userType,
        email: authenticatedUser.email,
        emailVerified: authenticatedUser.isEmailVerified,
      };

      const tokens = await this.buildAuthTokens(identity);
      const profilePhotoUrl = authenticatedUser.profilePhotoRef
        ? await this.usersFileStorage.getUrlAsync(authenticatedUser.profilePhotoRef)
        : googleUser.picture;

      return plainToInstance(
        GoogleSsoResponseModel,
        {
          ...authenticatedUser,
          accessToken: tokens.accessToken,
          paymentToken: tokens.paymentToken,
          requiresSubscription: tokens.requiresSubscription,
          subscriptionStatus: tokens.subscriptionStatus,
          profilePhotoUrl,
          isNewUser,
          isFirstLogin: wasFirstLogin,
          redirectPath: tokens.redirectPath,
        },
        {
          excludeExtraneousValues: true,
        },
      );
    } catch (error: unknown) {
      const err = asHttpLikeError(error);
      this.logger.error(
        {
          error: err.message,
          stack: err.stack,
          response: err.response?.data,
          status: err.response?.status,
        },
        'Google SSO error',
      );

      if (err.response?.status === 401) {
        throw new UnauthorizedException('Invalid Google authorization code');
      }
      if (err.response?.status === 400) {
        const googleError = err.response?.data?.error_description || err.response?.data?.error || err.message;
        throw new BadRequestException(
          `Invalid authorization code or client credentials: ${googleError || 'Please check your Google OAuth configuration'}`,
        );
      }
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new BadRequestException(`Google SSO failed: ${err.message || 'Unknown error'}`);
    }
  }

  generateJwtToken(payload: IIdentity, expiresIn: string = JWT_EXPIRES_IN): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.options.secret,
      audience: this.options.audience,
      issuer: this.options.issuer,
      expiresIn: expiresIn as any,
      algorithm: this.options.algorithm,
    });
  }

  private async invalidateUserDetailsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.USER_DETAILS, userId);
  }
}
