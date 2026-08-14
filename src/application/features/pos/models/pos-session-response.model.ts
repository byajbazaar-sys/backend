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

export class PosSessionQrResponseModel {
  @Expose()
  @ApiProperty()
  sessionId: string;

  @Expose()
  @ApiProperty()
  sessionCode: string;

  @Expose()
  @ApiProperty()
  expiresAt: Date;

  @Expose()
  @ApiProperty()
  token: string;

  @Expose()
  @ApiProperty({ description: 'Base64 PNG data URL of QR code' })
  qrCodeDataUrl: string;

  @Expose()
  @ApiProperty({ description: 'WebSocket URL for client connections' })
  websocketUrl: string;
}
