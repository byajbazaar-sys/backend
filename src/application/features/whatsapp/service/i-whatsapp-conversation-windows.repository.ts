export const WHATSAPP_CONVERSATION_WINDOWS_REPOSITORY = 'WHATSAPP_CONVERSATION_WINDOWS_REPOSITORY';

export interface IWhatsAppConversationWindowsRepository {
  getLastInboundAt(userId: string, wabaId: string, phoneNumberId: string, recipient: string): Promise<Date | null>;
  recordInboundMessage(
    userId: string,
    wabaId: string,
    phoneNumberId: string,
    recipient: string,
    inboundAt: Date,
  ): Promise<void>;
}
