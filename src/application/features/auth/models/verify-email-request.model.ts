import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyEmailRequestModel {
  @ApiProperty({ example: 'verification-token-from-email' })
  @IsString()
  token: string;
}
