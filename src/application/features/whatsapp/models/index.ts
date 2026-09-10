import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsUUID } from 'class-validator';

export * from './send-whatsapp-message-request.model';
export * from './send-whatsapp-document-message-request.model';
export * from './send-whatsapp-template-message-request.model';
export * from './create-whatsapp-template-request.model';
export * from './connect-whatsapp-business-request.model';
export * from './register-whatsapp-phone-request.model';
export * from './whatsapp-connection-response.model';
export * from './get-whatsapp-connection-query.model';
export * from './get-whatsapp-message-status-query.model';
export * from './update-whatsapp-settings-request.model';
export * from './whatsapp-webhook-payload.model';

export class ListWhatsAppTemplatesQueryModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;
}

export class WhatsAppMessageResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ example: 'wamid.HBgM...' })
  @Expose()
  messageId: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read', 'failed'], example: 'sent' })
  @Expose()
  deliveryStatus: string;

  @ApiProperty({ enum: ['text', 'template'], example: 'text' })
  @Expose()
  messageType: string;

  @ApiPropertyOptional({ example: 'byajbazaar_hello' })
  @Expose()
  templateName?: string;
}

export class WhatsAppMessageDeliveryStatusResponseModel {
  @ApiProperty({ example: 'wamid.HBgM...' })
  @Expose()
  messageId: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read', 'failed'], example: 'delivered' })
  @Expose()
  deliveryStatus: string;

  @ApiProperty({ example: '919827258776' })
  @Expose()
  recipient: string;

  @ApiPropertyOptional({ example: '1786968273' })
  @Expose()
  statusTimestamp?: string;

  @ApiPropertyOptional({ example: 131026 })
  @Expose()
  errorCode?: number;

  @ApiPropertyOptional({ example: 'Message undeliverable' })
  @Expose()
  errorTitle?: string;

  @ApiPropertyOptional({ example: 'Recipient phone number is not a WhatsApp user' })
  @Expose()
  errorMessage?: string;
}

export class WhatsAppTemplateCreateResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ example: '123456789' })
  @Expose()
  templateId: string;

  @ApiProperty({ example: 'PENDING' })
  @Expose()
  status: string;
}

export class WhatsAppTemplateSummaryResponseModel {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  language: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiPropertyOptional()
  @Expose()
  category?: string;
}

export class WhatsAppTemplateListResponseModel {
  @ApiProperty({ type: [WhatsAppTemplateSummaryResponseModel] })
  @Expose()
  items: WhatsAppTemplateSummaryResponseModel[];
}

export class WhatsAppWebhookAckResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  received: boolean;
}

export class WhatsAppRegisterPhoneResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ example: 'CONNECTED' })
  @Expose()
  status: string;
}
