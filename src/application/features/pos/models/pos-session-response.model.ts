import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { EPosSessionStatus } from '../enums';

export class PosSessionResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  sessionCode: string;

  @Expose()
  @ApiProperty({ enum: EPosSessionStatus })
  status: EPosSessionStatus;

  @Expose()
  @ApiProperty()
  expiresAt: Date;

  @Expose()
  @ApiPropertyOptional()
  desktopConnectionId?: string;

  @Expose()
  @ApiPropertyOptional()
  mobileConnectionId?: string;

  @Expose()
  @ApiProperty()
  createdAt: Date;
}
