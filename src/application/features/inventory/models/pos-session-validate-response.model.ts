import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { EPosSessionStatus } from '../enums';

export class PosSessionValidateResponseModel {
  @Expose()
  @ApiProperty()
  valid: boolean;

  @Expose()
  @ApiProperty()
  sessionId: string;

  @Expose()
  @ApiProperty({ enum: EPosSessionStatus })
  status: EPosSessionStatus;

  @Expose()
  @ApiProperty()
  expiresAt: Date;

  @Expose()
  @ApiProperty()
  websocketUrl: string;
}
