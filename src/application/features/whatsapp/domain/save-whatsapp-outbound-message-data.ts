import { Expose } from 'class-transformer';

import {
  EWhatsAppMessageContextType,
  EWhatsAppMessageDeliveryStatus,
  EWhatsAppMessageType,
} from '../enums';

export class SaveWhatsAppOutboundMessageData {
  @Expose()
  userId: string;

  @Expose()
  wabaId: string;

  @Expose()
  phoneNumberId: string;

  @Expose()
  metaMessageId: string;

  @Expose()
  recipient: string;

  @Expose()
  messageType?: EWhatsAppMessageType;

  @Expose()
  templateName?: string;

  @Expose()
  contextType?: EWhatsAppMessageContextType;

  @Expose()
  contextId?: string;

  @Expose()
  contextLabel?: string;

  @Expose()
  deliveryStatus: EWhatsAppMessageDeliveryStatus;

  @Expose()
  statusTimestamp?: string;
}
