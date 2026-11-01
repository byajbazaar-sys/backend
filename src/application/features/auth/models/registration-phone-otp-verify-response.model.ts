import { ApiProperty } from '@nestjs/swagger';

export class RegistrationPhoneOtpVerifyResponseModel {
  @ApiProperty({ description: 'Short-lived signed proof to submit with signup' })
  phoneVerificationToken: string;

  @ApiProperty({ example: 1800 })
  expiresInSeconds: number;
}
