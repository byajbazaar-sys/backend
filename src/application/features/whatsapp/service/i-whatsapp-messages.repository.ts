import {
  SaveWhatsAppOutboundMessageData,
  UpdateWhatsAppMessageStatusData,
  WhatsAppMessage,
} from '../domain';

export const WHATSAPP_MESSAGES_REPOSITORY = 'WHATSAPP_MESSAGES_REPOSITORY';

export interface IWhatsAppMessagesRepository {
  createOutboundMessage(data: SaveWhatsAppOutboundMessageData): Promise<WhatsAppMessage>;
  findByMetaMessageId(metaMessageId: string): Promise<WhatsAppMessage | null>;
  findByUserIdAndMetaMessageId(userId: string, metaMessageId: string): Promise<WhatsAppMessage | null>;
  applyStatusUpdate(metaMessageId: string, update: UpdateWhatsAppMessageStatusData): Promise<WhatsAppMessage | null>;
}
