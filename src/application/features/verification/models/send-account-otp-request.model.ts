import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { OTP_CHANNELS } from './otp-channels.constants';

export class SendAccountOtpRequestModel {
  @ApiProperty({ enum: OTP_CHANNELS })
  @IsIn(OTP_CHANNELS)
  channel: 'email' | 'phone';

  @ApiPropertyOptional({ description: 'Mobile number to verify (phone channel). Email always uses the account email.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  target?: string;
}
