import { ApiProperty } from '@nestjs/swagger';

export class RegistrationEmailVerifyResponseModel {
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: 'Short-lived signed proof to submit with signup' })
  emailVerificationToken: string;

  @ApiProperty({ description: 'Unix time in seconds when the proof expires' })
  expiresAt: number;
}
