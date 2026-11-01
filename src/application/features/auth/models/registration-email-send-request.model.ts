import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class RegistrationEmailSendRequestModel {
  @Expose()
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsString()
  @MaxLength(254)
  email: string;
}
