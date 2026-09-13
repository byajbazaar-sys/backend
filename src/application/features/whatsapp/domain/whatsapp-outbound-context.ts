import { Expose } from 'class-transformer';

import { EWhatsAppMessageContextType, EWhatsAppMessageType } from '../enums';

export class WhatsAppOutboundContext {
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
}
