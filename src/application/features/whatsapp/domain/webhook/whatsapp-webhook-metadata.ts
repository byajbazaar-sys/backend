import { Expose } from 'class-transformer';

export class WhatsAppWebhookMetadata {
  @Expose({ name: 'display_phone_number' })
  displayPhoneNumber: string;

  @Expose({ name: 'phone_number_id' })
  phoneNumberId: string;
}
