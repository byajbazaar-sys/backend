import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class SendOtpResponseModel {
  @Expose()
  @ApiProperty({ description: 'Send this back with the code. It does not contain the code.' })
  challengeToken: string;

  @Expose()
  @ApiProperty()
  expiresAt: Date;

  @Expose()
  @ApiProperty({ example: 30 })
  resendAfterSeconds: number;

  @Expose()
  @ApiProperty({ example: '+91 98******10' })
  maskedTarget: string;
}
