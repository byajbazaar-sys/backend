import { EWhatsAppMessageContextType, EWhatsAppMessageDeliveryStatus } from '../enums';

export interface WhatsAppMessagesFilterOptions {
  userId: string;
  pageNumber?: number;
  pageSize?: number;
  recipient?: string;
  deliveryStatus?: EWhatsAppMessageDeliveryStatus;
  contextType?: EWhatsAppMessageContextType;
}
