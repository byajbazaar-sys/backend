import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class VerificationStatusResponseModel {
  @Expose()
  @ApiProperty()
  email: string;

  @Expose()
  @ApiProperty()
  isEmailVerified: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  phoneNumber: string;

  @Expose()
  @ApiProperty()
  isPhoneVerified: boolean;

  @Expose()
  @ApiProperty()
  phoneVerificationRequired: boolean;
}
