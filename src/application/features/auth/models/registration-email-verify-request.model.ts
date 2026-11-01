import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrationEmailVerifyRequestModel {
  @Expose()
  @ApiProperty({ description: 'Signed email verification token from the registration email' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  token: string;
}
