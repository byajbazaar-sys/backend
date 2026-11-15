import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export const OTP_CHANNELS = ['email', 'phone'] as const;

export class SendSignupOtpRequestModel {
  @ApiProperty({ enum: OTP_CHANNELS })
  @IsIn(OTP_CHANNELS)
  channel: 'email' | 'phone';

  @ApiProperty({ example: '9876543210', description: 'Email address, or Indian mobile number' })
  @IsString()
  @MaxLength(255)
  target: string;
}

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

export class SendOtpResponseModel {
  @Expose()
  @ApiProperty({ description: 'Send this back with the code. It does not contain the code.' })
  challengeToken: string;

  @Expose()
  @ApiProperty()
  expiresAt: Date;

  @Expose()
  @ApiProperty({ example: 30 })
  resendAfterSeconds: number;

  @Expose()
  @ApiProperty({ example: '+91 98******10' })
  maskedTarget: string;
}

export class VerificationStatusResponseModel {
  @Expose()
  @ApiProperty()
  email: string;

  @Expose()
  @ApiProperty()
  isEmailVerified: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  phoneNumber: string;

  @Expose()
  @ApiProperty()
  isPhoneVerified: boolean;

  @Expose()
  @ApiProperty()
  phoneVerificationRequired: boolean;
}
