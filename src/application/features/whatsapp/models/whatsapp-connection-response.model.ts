import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { EWhatsAppConnectionStatus } from '../enums';

export class WhatsAppConnectionResponseModel {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  wabaId: string;

  @ApiProperty()
  @Expose()
  phoneNumberId: string;

  @ApiPropertyOptional()
  @Expose()
  displayPhoneNumber?: string;

  @ApiPropertyOptional()
  @Expose()
  businessName?: string;

  @ApiProperty({ enum: EWhatsAppConnectionStatus })
  @Expose()
  connectionStatus: EWhatsAppConnectionStatus;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

export class WhatsAppDisconnectResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;
}
