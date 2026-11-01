import { ApiProperty } from '@nestjs/swagger';

export class RegistrationEmailSendResponseModel {
  @ApiProperty()
  message: string;

  @ApiProperty({ example: 60 })
  retryAfterSeconds: number;
}
