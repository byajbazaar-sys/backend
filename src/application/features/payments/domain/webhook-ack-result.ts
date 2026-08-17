import { Expose } from 'class-transformer';

export class WebhookAckResult {
  @Expose()
  received: boolean;

  @Expose()
  duplicate?: boolean;
}
