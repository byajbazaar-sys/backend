import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

import { OTP_CHANNELS } from './otp-channels.constants';

export class SendSignupOtpRequestModel {
  @ApiProperty({ enum: OTP_CHANNELS })
  @IsIn(OTP_CHANNELS)
  channel: 'email' | 'phone';

  @ApiProperty({ example: '9876543210', description: 'Email address, or Indian mobile number' })
  @IsString()
  @MaxLength(255)
  target: string;
}
