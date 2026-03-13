import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiConsumes } from '@nestjs/swagger';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IAuthService } from './interfaces';
import {
  LoginRequestModel,
  LoginResponseModel,
  SignupRequestModel,
  SignupResponseModel,
  ForgotPasswordRequestModel,
  ResetPasswordRequestModel,
  VerifyEmailRequestModel,
  GoogleSsoRequestModel,
  GoogleSsoResponseModel,
} from './models';
import { User } from '../users';
import { plainToInstance } from 'class-transformer';
import { AUTH_SERVICE } from './interfaces';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SERVICE) private readonly authService: IAuthService,
    @InjectPinoLogger(AuthController.name) private readonly logger: PinoLogger,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Login and receive JWT' })
  @ApiOkResponse({ type: LoginResponseModel })
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginRequestModel): Promise<LoginResponseModel> {
    this.logger.info({ email: body.email }, 'login called');
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
  async signup(
    @Body() body: SignupRequestModel,
    @UploadedFile() profilePhoto: Express.Multer.File,
  ): Promise<SignupResponseModel> {
    this.logger.info({ email: body.email }, 'signup called');
    const user = plainToInstance(User, body);
    if (profilePhoto) {
      user.profilePhoto = profilePhoto.buffer;
      user.profilePhotoFileName = profilePhoto.originalname;
      user.profilePhotoContentType = profilePhoto.mimetype;
    }
    const response = await this.authService.signup(user);

    return plainToInstance(
      SignupResponseModel,
      { ...response, profilePhotoUrl: response.profilePhotoRef },
      {
        excludeExtraneousValues: true,
      },
    );
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Initiate password reset by email' })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordRequestModel): Promise<void> {
    this.logger.info({ email: body.email }, 'forgotPassword called');
    await this.authService.forgotPassword(body.email);
  }

  @Post('resend-verification-email')
  @ApiOperation({ summary: 'Resend verification email for unverified accounts' })
  @HttpCode(HttpStatus.OK)
  async resendVerificationEmail(@Body() body: ForgotPasswordRequestModel): Promise<{ message: string }> {
    this.logger.info({ email: body.email }, 'resendVerificationEmail called');
    await this.authService.resendVerificationEmail(body.email);
    return { message: 'Verification email sent successfully' };
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email using token from verification email' })
  @ApiOkResponse({ type: LoginResponseModel })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: VerifyEmailRequestModel): Promise<LoginResponseModel> {
    this.logger.info({ hasToken: !!body.token }, 'verifyEmail called');
    const response = await this.authService.verifyEmail(body.token);
    return plainToInstance(LoginResponseModel, response, {
      excludeExtraneousValues: true,
    });
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token' })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordRequestModel): Promise<string> {
    this.logger.info({ token: body.token ? 'provided' : 'missing' }, 'resetPassword called');
    await this.authService.verifyForgotPasswordToken(body.token, body.newPassword);
    return 'Password reset successfully';
  }

  @Post('google-sso')
  @ApiOperation({ summary: 'Authenticate with Google SSO' })
  @ApiOkResponse({ type: GoogleSsoResponseModel })
  @HttpCode(HttpStatus.OK)
  async googleSso(@Body() body: GoogleSsoRequestModel): Promise<GoogleSsoResponseModel> {
    this.logger.info({
      hasAuthCode: !!body.authCode,
      hasAccessToken: !!body.accessToken
    }, 'googleSso called');
    const response = await this.authService.googleSso(body);
    return plainToInstance(GoogleSsoResponseModel, response, {
      excludeExtraneousValues: true,
    });
  }
}
