import { Expose } from 'class-transformer';

import { EWhatsAppMessageDeliveryStatus } from '../enums';

export class WhatsAppMessageResult {
  @Expose()
  success: boolean;

  @Expose()
  messageId: string;

  @Expose()
  deliveryStatus: EWhatsAppMessageDeliveryStatus;

  @Expose()
  messageType: 'text' | 'template' | 'document';

  @Expose()
  templateName?: string;
}
