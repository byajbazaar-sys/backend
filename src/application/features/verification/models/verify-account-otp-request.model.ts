import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { OTP_CHANNELS } from './otp-channels.constants';

export class VerifyAccountOtpRequestModel {
  @ApiProperty({ enum: OTP_CHANNELS })
  @IsIn(OTP_CHANNELS)
  channel: 'email' | 'phone';

  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  challengeToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code: string;

  @ApiPropertyOptional({ description: 'Mobile number the code was sent to (phone channel)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  target?: string;
}
