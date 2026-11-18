import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  SendAccountOtpRequestModel,
  SendOtpResponseModel,
  VerificationStatusResponseModel,
  VerifyAccountOtpRequestModel,
} from './models';
import { VerificationService } from './service';

/** Account → verify email / mobile for signed-in users (existing accounts, Google sign-ups). */
@ApiTags('verification')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('users/me/verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @ApiOperation({ summary: 'Email / mobile verification status of the signed-in user' })
  @ApiOkResponse({ type: VerificationStatusResponseModel })
  async status(@Identity() identity: IIdentity): Promise<VerificationStatusResponseModel> {
    return plainToInstance(VerificationStatusResponseModel, await this.verification.getStatus(identity.userId), {
      excludeExtraneousValues: true,
    });
  }

  @Post('send')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a code to the account email, or to a mobile number to verify (SMS)' })
  @ApiOkResponse({ type: SendOtpResponseModel })
  @HttpCode(HttpStatus.OK)
  async send(@Identity() identity: IIdentity, @Body() body: SendAccountOtpRequestModel): Promise<SendOtpResponseModel> {
    const result = await this.verification.sendAccountCode(identity.userId, body.channel, body.target);
    return plainToInstance(SendOtpResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post('verify')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check the code and mark the email / mobile number as verified' })
  @ApiOkResponse({ type: VerificationStatusResponseModel })
  @HttpCode(HttpStatus.OK)
  async verify(
    @Identity() identity: IIdentity,
    @Body() body: VerifyAccountOtpRequestModel,
  ): Promise<VerificationStatusResponseModel> {
    const status = await this.verification.verifyAccountCode(
      identity.userId,
      body.channel,
      body.challengeToken,
      body.code,
      body.target,
    );
    return plainToInstance(VerificationStatusResponseModel, status, { excludeExtraneousValues: true });
  }
}
