import { ApiProperty } from '@nestjs/swagger';

export class RegistrationPhoneOtpSendResponseModel {
  @ApiProperty({ description: 'Signed, phone-bound challenge token for OTP verification' })
  challengeToken: string;

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;

  @ApiProperty({ example: 60 })
  retryAfterSeconds: number;
}
