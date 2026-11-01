import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegistrationPhoneOtpVerifyRequestModel {
  @Expose()
  @ApiProperty({ description: 'Short-lived challenge token returned by the OTP send endpoint' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  challengeToken: string;

  @Expose()
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit code' })
  otpCode: string;
}
