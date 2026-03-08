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
import { IIdentity, UsersAuthOptions, JWT_EXPIRES_IN, BCRYPT_SALT_ROUNDS } from '@shared-libs';
import { randomBytes } from 'crypto';
import { LoginResponseModel } from './models';
import { IUsersRepository, User, USERS_REPOSITORY } from '../users';
import { IAuthService } from './interfaces';
import { compareSync, hashSync } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { USERS_FILE_STORAGE, IUsersFileStorage, FileStorageOptions } from '../../shared';
import { v4 as uuidv4 } from 'uuid';
import { EMAIL_SERVICE, IEmailService } from '../../shared/services/i-email.service';
import { WebAppOptions } from '../../shared';
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
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly usersFileStorage: IUsersFileStorage,
    @Inject(EMAIL_SERVICE) private readonly emailService: IEmailService,
    @Inject(EMAIL_TEMPLATE_SERVICE) private readonly emailTemplateService: IEmailTemplateService,
    private readonly webAppOptions: WebAppOptions,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) { }

  async login(email: string, password: string): Promise<LoginResponseModel> {
    try {
      const user = await this.usersRepo.findByEmail(email.toLowerCase().trim());
      if (!user || !compareSync(password, user.password)) {
        throw new UnauthorizedException('Invalid credentials');
      }

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
