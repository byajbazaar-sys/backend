import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IIdentity, UsersAuthOptions, JWT_EXPIRES_IN, BCRYPT_SALT_ROUNDS } from '@shared-libs';
import { randomBytes } from 'crypto';
import { LoginResponseModel } from './models';
import { IUsersRepository, User, USERS_REPOSITORY } from '../users';
import { IAuthService } from './interfaces';
import { compareSync, hashSync } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { USERS_FILE_STORAGE, IUsersFileStorage, FileStorageOptions } from '../../shared';
import { Types } from 'mongoose';

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly options: UsersAuthOptions,
    protected readonly fileStorageOptions: FileStorageOptions,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly usersFileStorage: IUsersFileStorage,
  ) {}

  async login(email: string, password: string): Promise<LoginResponseModel> {
    try {
      const user = await this.usersRepo.findByEmail(email.toLowerCase().trim());
      if (!user || !compareSync(password, user.password)) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const identity: IIdentity = {
        userId: user._id.toString(),
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
      user._id = new Types.ObjectId();
      if (user.profilePhoto && user.profilePhotoContentType) {
        const fileExtension = user.profilePhotoContentType.split('/')[1];
        user.profilePhotoRef = `users/profiles/${user._id.toString()}.${fileExtension}`;
        await this.usersFileStorage.writeAsync(user.profilePhotoRef, user.profilePhoto, user.profilePhotoContentType);
      }

      const createdUser = await this.usersRepo.create({
        ...user,
        emailVerificationToken: randomBytes(32).toString('hex'),
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
      // await this.usersRepo.update(user._id, { resetPasswordToken, resetPasswordExpires });
    } catch (err) {
      throw err;
    }
  }

  async verifyForgotPasswordToken(token: string, newPassword: string): Promise<User> {
    try {
      const user = await this.usersRepo.findByEmailVerificationToken(token);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.emailVerificationExpires < new Date()) {
        throw new BadRequestException('Token expired');
      }

      user.password = hashSync(newPassword, BCRYPT_SALT_ROUNDS);
      user.emailVerificationToken = null;
      user.emailVerificationExpires = null;
      await this.usersRepo.update(user._id.toString(), user);
      return user;
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
