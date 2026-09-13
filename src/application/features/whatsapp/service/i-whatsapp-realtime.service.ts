import { WhatsAppMessage } from '../domain';

export const WHATSAPP_REALTIME_SERVICE = 'WHATSAPP_REALTIME_SERVICE';

export interface IWhatsAppRealtimeService {
  /** Push delivery status changes to the business owner's open WebSocket tabs. */
  notifyMessageUpdated(message: WhatsAppMessage): Promise<void>;
  /** Push a newly logged outbound message (bills, reminders, test sends). */
  notifyMessageCreated(message: WhatsAppMessage): Promise<void>;
}
