import { ApiProperty } from '@nestjs/swagger';
import { PHONE_E164_REGEX } from '@shared-libs';
import { Expose } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class RegistrationPhoneOtpSendRequestModel {
  @Expose()
  @ApiProperty({ example: '+919876543210', description: 'Phone number in E.164 format' })
  @IsString()
  @MaxLength(16)
  @Matches(PHONE_E164_REGEX, { message: 'Please provide a valid phone number in E.164 format' })
  phoneNumber: string;
}
