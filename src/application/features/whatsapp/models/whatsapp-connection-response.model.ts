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

  @ApiProperty({ default: false })
  @Expose()
  dueRemindersEnabled: boolean;

  @ApiPropertyOptional({
    description: 'Live Meta Cloud API phone registration status',
    example: 'CONNECTED',
  })
  @Expose()
  metaPhoneStatus?: string;

  @ApiPropertyOptional({
    description: 'Live Meta display name review status',
    example: 'APPROVED',
  })
  @Expose()
  displayNameStatus?: string;

  @ApiPropertyOptional({
    description: 'Live Meta verified display name for the sender number',
    example: 'ByajBazaar',
  })
  @Expose()
  verifiedDisplayName?: string;

  @ApiPropertyOptional()
  @Expose()
  codeVerificationStatus?: string;

  @ApiPropertyOptional({
    description: 'Whether Meta currently allows outbound messaging for this phone number',
  })
  @Expose()
  canSendMessages?: boolean;

  @ApiPropertyOptional({
    description: 'Human-readable reason outbound messaging is blocked, when canSendMessages is false',
  })
  @Expose()
  messagingBlockReason?: string;

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
