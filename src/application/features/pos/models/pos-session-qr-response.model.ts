import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

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
