import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiConsumes } from '@nestjs/swagger';

import { IAuthService } from './interfaces';
import {
  LoginRequestModel,
  LoginResponseModel,
  SignupRequestModel,
  SignupResponseModel,
  ForgotPasswordRequestModel,
  ResetPasswordRequestModel,
} from './models';
import { User } from '../users';
import { plainToInstance } from 'class-transformer';
import { Inject } from '@nestjs/common';
import { AUTH_SERVICE } from './interfaces';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly authService: IAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login and receive JWT' })
  @ApiOkResponse({ type: LoginResponseModel })
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginRequestModel): Promise<LoginResponseModel> {
    const response = await this.authService.login(body.email, body.password);

    return plainToInstance(
      LoginResponseModel,
      { ...response },
      {
        excludeExtraneousValues: true,
      },
    );
  }

  @Post('signup')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profilePhoto'))
  @ApiOperation({ summary: 'Create a new user' })
  @ApiOkResponse({ type: SignupResponseModel })
  @HttpCode(HttpStatus.OK)
  async signup(@Body() body: SignupRequestModel, @UploadedFile() profilePhoto: Express.Multer.File): Promise<SignupResponseModel> {
    const user = plainToInstance(User, body);
    if (profilePhoto) {
      user.profilePhoto = profilePhoto.buffer;
      user.profilePhotoFileName = profilePhoto.originalname;
      user.profilePhotoContentType = profilePhoto.mimetype;
    }
    const response = await this.authService.signup(user);

    const accessToken = await this.authService.generateJwtToken({
      userId: response.id,
      userType: response.userType,
      email: response.email,
      emailVerified: response.isEmailVerified,
    });

    return plainToInstance(
      SignupResponseModel,
      { accessToken, ...response, id: response.id },
      {
        excludeExtraneousValues: true,
      },
    );
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Initiate password reset by email' })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordRequestModel): Promise<void> {
    await this.authService.forgotPassword(body.email);
    return;
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token' })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordRequestModel): Promise<string> {
    await this.authService.verifyForgotPasswordToken(body.token, body.newPassword);
    return 'Password reset successfully';
  }
}
