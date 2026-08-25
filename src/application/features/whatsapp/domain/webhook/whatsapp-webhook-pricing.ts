import { Expose } from 'class-transformer';

export class WhatsAppWebhookPricing {
  @Expose()
  billable: boolean;

  @Expose({ name: 'pricing_model' })
  pricingModel: string;

  @Expose()
  category: string;

  @Expose()
  type: string;
}
