import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { WhatsAppWebhookConversationModel } from './whatsapp-webhook-conversation.model';
import { WhatsAppWebhookPricingModel } from './whatsapp-webhook-pricing.model';

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
