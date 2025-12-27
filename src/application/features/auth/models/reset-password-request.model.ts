import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_COMPLEXITY_REGEX, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@shared-libs';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class ResetPasswordRequestModel {
  @ApiProperty({ example: 'reset-token-uuid-or-random-string' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewStr0ngP@ss!' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_REGEX)
  newPassword: string;
}
