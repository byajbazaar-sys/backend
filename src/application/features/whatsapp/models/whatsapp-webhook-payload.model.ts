import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class WhatsAppWebhookConversationOriginModel {
  @ApiProperty({ example: 'utility' })
  @Expose()
  type: string;
}

export class WhatsAppWebhookConversationModel {
  @ApiProperty({ example: 'd552e6f3a0e9cc0b3d0bb6b3df01e250' })
  @Expose()
  id: string;

  @ApiProperty({ type: WhatsAppWebhookConversationOriginModel })
  @Expose()
  @Type(() => WhatsAppWebhookConversationOriginModel)
  origin: WhatsAppWebhookConversationOriginModel;
}

export class WhatsAppWebhookPricingModel {
  @ApiProperty({ example: true })
  @Expose()
  billable: boolean;

  @ApiProperty({ example: 'PMP' })
  @Expose()
  pricingModel: string;

  @ApiProperty({ example: 'utility' })
  @Expose()
  category: string;

  @ApiProperty({ example: 'regular' })
  @Expose()
  type: string;
}

export class WhatsAppWebhookMessageStatusModel {
  @ApiProperty({ example: 'wamid.HBgMOTE5ODI3MjU4Nzc2FQIAERgSN0Q0NEJBNEE3NUUwOEIwNERDAA==' })
  @Expose()
  id: string;

  @ApiProperty({ enum: ['sent', 'delivered', 'read', 'failed'], example: 'read' })
  @Expose()
  status: string;

  @ApiProperty({ example: '1786968273' })
  @Expose()
  timestamp: string;

  @ApiProperty({ example: '919827258776' })
  @Expose()
  recipientId: string;

  @ApiPropertyOptional()
  @Expose()
  recipientLogicalId?: string;

  @ApiPropertyOptional()
  @Expose()
  recipientUserId?: string;

  @ApiPropertyOptional({ type: WhatsAppWebhookConversationModel })
  @Expose()
  @Type(() => WhatsAppWebhookConversationModel)
  conversation?: WhatsAppWebhookConversationModel;

  @ApiPropertyOptional({ type: WhatsAppWebhookPricingModel })
  @Expose()
  @Type(() => WhatsAppWebhookPricingModel)
  pricing?: WhatsAppWebhookPricingModel;
}

export class WhatsAppWebhookContactModel {
  @ApiProperty({ example: '919827258776' })
  @Expose()
  waId: string;

  @ApiPropertyOptional({ example: 'IN.2321023728634926' })
  @Expose()
  userId?: string;
}

export class WhatsAppWebhookMetadataModel {
  @ApiProperty({ example: '15556723762' })
  @Expose()
  displayPhoneNumber: string;

  @ApiProperty({ example: '1253758921161028' })
  @Expose()
  phoneNumberId: string;
}

export class WhatsAppWebhookMessageTextModel {
  @ApiProperty({ example: 'Hello from ByajBazaar' })
  @Expose()
  body: string;
}

export class WhatsAppWebhookInboundMessageModel {
  @ApiProperty({ example: '919827258776' })
  @Expose()
  from: string;

  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  timestamp: string;

  @ApiProperty({ example: 'text' })
  @Expose()
  type: string;

  @ApiPropertyOptional({ type: WhatsAppWebhookMessageTextModel })
  @Expose()
  @Type(() => WhatsAppWebhookMessageTextModel)
  text?: WhatsAppWebhookMessageTextModel;
}

export class WhatsAppWebhookValueModel {
  @ApiProperty({ example: 'whatsapp' })
  @Expose()
  messagingProduct: string;

  @ApiProperty({ type: WhatsAppWebhookMetadataModel })
  @Expose()
  @Type(() => WhatsAppWebhookMetadataModel)
  metadata: WhatsAppWebhookMetadataModel;

  @ApiPropertyOptional({ type: [WhatsAppWebhookContactModel] })
  @Expose()
  @Type(() => WhatsAppWebhookContactModel)
  contacts?: WhatsAppWebhookContactModel[];

  @ApiPropertyOptional({ type: [WhatsAppWebhookInboundMessageModel] })
  @Expose()
  @Type(() => WhatsAppWebhookInboundMessageModel)
  messages?: WhatsAppWebhookInboundMessageModel[];

  @ApiPropertyOptional({ type: [WhatsAppWebhookMessageStatusModel] })
  @Expose()
  @Type(() => WhatsAppWebhookMessageStatusModel)
  statuses?: WhatsAppWebhookMessageStatusModel[];
}

export class WhatsAppWebhookChangeModel {
  @ApiProperty({ type: WhatsAppWebhookValueModel })
  @Expose()
  @Type(() => WhatsAppWebhookValueModel)
  value: WhatsAppWebhookValueModel;

  @ApiProperty({ example: 'messages' })
  @Expose()
  field: string;
}

export class WhatsAppWebhookEntryModel {
  @ApiProperty({ example: '1837718593882679' })
  @Expose()
  id: string;

  @ApiProperty({ type: [WhatsAppWebhookChangeModel] })
  @Expose()
  @Type(() => WhatsAppWebhookChangeModel)
  changes: WhatsAppWebhookChangeModel[];
}

export class WhatsAppWebhookPayloadModel {
  @ApiProperty({ example: 'whatsapp_business_account' })
  @Expose()
  object: string;

  @ApiProperty({ type: [WhatsAppWebhookEntryModel] })
  @Expose()
  @Type(() => WhatsAppWebhookEntryModel)
  entry: WhatsAppWebhookEntryModel[];
}
