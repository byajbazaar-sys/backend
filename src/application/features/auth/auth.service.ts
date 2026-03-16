import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JwtService } from '@nestjs/jwt';
import { IIdentity, UsersAuthOptions, JWT_EXPIRES_IN, BCRYPT_SALT_ROUNDS, EUserType } from '@shared-libs';
import { randomBytes } from 'crypto';
import { LoginResponseModel, GoogleSsoResponseModel, GoogleSsoRequestModel } from './models';
import { IUsersRepository, User, USERS_REPOSITORY } from '../users';
import { IAuthService } from './interfaces';
import { compareSync, hashSync } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
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
} from '../../shared';
import { v4 as uuidv4 } from 'uuid';
import {
  EMAIL_TEMPLATE_SERVICE,
  IEmailTemplateService,
} from '../notifications';

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
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) { }

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
          'This account was created with Google Sign-In. Please use "Forgot Password" to set a password and login, or sign in with Google.'
        );
      }

      // Password doesn't match
      if (!compareSync(password, user.password)) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Update last login timestamp
      await this.usersRepo.update(user.id, {
        lastLoginAt: new Date(),
      });

      const identity: IIdentity = {
        userId: user.id,
        userType: user.userType,
        email: user.email,
        emailVerified: user.isEmailVerified,
      };

      const token = await this.generateJwtToken(identity);
      const response = plainToInstance(
        LoginResponseModel,
        {
          ...user,
          accessToken: token,
          profilePhotoUrl: user.profilePhotoRef ? await this.usersFileStorage.getUrlAsync(user.profilePhotoRef) : null,
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
    const existingUser = await this.usersRepo.findByEmail(user.email.toLowerCase().trim());
    if (existingUser) {
      // User exists - check if it's a Google user
      if (existingUser.isGoogleUser) {
        throw new ConflictException(
          'This email is already registered with Google Sign-In. Please sign in with Google or use "Forgot Password" to set a password.'
        );
      }
      // Regular user already exists
      throw new ConflictException('User with this email already exists');
    }

    try {
      const userId = uuidv4();
      user.id = userId;
      this.logger.debug({ userId, email: user.email }, 'Creating new user');
      if (user.profilePhoto && user.profilePhotoContentType) {
        const fileExtension = user.profilePhotoContentType.split('/')[1];
        user.profilePhotoRef = `users/profiles/${userId}.${fileExtension}`;
        await this.usersFileStorage.writeAsync(user.profilePhotoRef, user.profilePhoto, user.profilePhotoContentType);
      }

      const emailVerificationToken = randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const createdUser = await this.usersRepo.create({
        ...user,
        emailVerificationToken,
        emailVerificationExpires,
      });

      const verificationUrl = this.webAppOptions.buildVerifyEmailUrl(emailVerificationToken);
      const html = this.emailTemplateService.renderEmailVerification({
        userName: user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() || user.email : user.email ?? 'User',
        verificationUrl,
      });
      await this.emailService.sendEmail({
        to: user.email,
        subject: 'Verify your email address',
        body: html,
        isHtml: true,
      });

      return {
        ...createdUser,
        profilePhotoRef: user.profilePhotoRef ? await this.usersFileStorage.getUrlAsync(user.profilePhotoRef) : null,
      };
    } catch (err) {
      if (err instanceof BadRequestException) {
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
      const resetPasswordToken = randomBytes(32).toString('hex');
      const resetPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.usersRepo.update(user.id, {
        resetPasswordToken,
        resetPasswordExpires,
      });

      const resetUrl = this.webAppOptions.buildResetPasswordUrl(resetPasswordToken);
      const html = this.emailTemplateService.renderForgotPassword({
        userName: user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() || user.email : user.email ?? 'User',
        resetUrl,
      });
      await this.emailService.sendEmail({
        to: user.email,
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

      await this.usersRepo.update(user.id, {
        password: hashSync(newPassword, BCRYPT_SALT_ROUNDS),
        resetPasswordToken: null,
        resetPasswordExpires: null,
      });
      return { ...user, password: undefined };
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

      const emailVerificationToken = randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.usersRepo.update(user.id, {
        emailVerificationToken,
        emailVerificationExpires,
      });

      const verificationUrl = this.webAppOptions.buildVerifyEmailUrl(emailVerificationToken);
      const html = this.emailTemplateService.renderEmailVerification({
        userName: user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() || user.email : user.email ?? 'User',
        verificationUrl,
      });
      await this.emailService.sendEmail({
        to: user.email,
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
      await this.usersRepo.update(user.id, {
        isEmailVerified: true,
        emailVerifiedAt: now,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      });

      const updatedUser = { ...user, isEmailVerified: true, emailVerifiedAt: now };
      const identity: IIdentity = {
        userId: updatedUser.id,
        userType: updatedUser.userType,
        email: updatedUser.email,
        emailVerified: true,
      };
      const accessToken = await this.generateJwtToken(identity);
      const profilePhotoUrl = updatedUser.profilePhotoRef
        ? await this.usersFileStorage.getUrlAsync(updatedUser.profilePhotoRef)
        : null;

      return plainToInstance(
        LoginResponseModel,
        {
          ...updatedUser,
          accessToken,
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
          // User exists with same email - link Google account to existing user
          // This allows users who registered with email/password to later use Google Sign-In
          await this.usersRepo.update(existingUser.id, {
            googleId: googleUser.sub,
            isGoogleUser: true,
            isEmailVerified: true, // Google emails are verified
            emailVerifiedAt: existingUser.emailVerifiedAt || new Date(),
            lastLoginAt: new Date(),
          });
          
          // Refresh user data
          user = await this.usersRepo.findById(existingUser.id);
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
          emailVerifiedAt: new Date(),
          userType: EUserType.User,
          googleId: googleUser.sub,
          isGoogleUser: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          profilePhoto: Buffer.alloc(0),
          profilePhotoFileName: '',
          profilePhotoContentType: '',
        });
        isNewUser = true;
      } else if (!isNewUser) {
        // Update last login for existing user (only if we didn't just create it)
        await this.usersRepo.update(user.id, {
          lastLoginAt: new Date(),
        });
        // Refresh user to get updated timestamp
        user = await this.usersRepo.findById(user.id);
      }

      const identity: IIdentity = {
        userId: user.id,
        userType: user.userType,
        email: user.email,
        emailVerified: user.isEmailVerified,
      };

      const token = await this.generateJwtToken(identity);
      const profilePhotoUrl = user.profilePhotoRef
        ? await this.usersFileStorage.getUrlAsync(user.profilePhotoRef)
        : googleUser.picture;

      return plainToInstance(
        GoogleSsoResponseModel,
        {
          ...user,
          accessToken: token,
          profilePhotoUrl,
          isNewUser,
        },
        {
          excludeExtraneousValues: true,
        },
      );
    } catch (error) {
      this.logger.error({ 
        error: error?.message, 
        stack: error?.stack, 
        response: error?.response?.data,
        status: error?.response?.status 
      }, 'Google SSO error');
      
      if (error.response?.status === 401) {
        throw new UnauthorizedException('Invalid Google authorization code');
      }
      if (error.response?.status === 400) {
        const googleError = error.response?.data?.error_description || error.response?.data?.error || error.message;
        throw new BadRequestException(
          `Invalid authorization code or client credentials: ${googleError || 'Please check your Google OAuth configuration'}`
        );
      }
      if (error instanceof BadRequestException || error instanceof UnauthorizedException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Google SSO failed: ${error?.message || 'Unknown error'}`);
    }
  }

  generateJwtToken(payload: IIdentity): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.options.secret,
      audience: this.options.audience,
      issuer: this.options.issuer,
      expiresIn: JWT_EXPIRES_IN,
      algorithm: this.options.algorithm,
    });
  }
}


