import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppWebhookPricingModel {
  @ApiProperty({ example: true })
  @Expose()
  billable: boolean;

  @ApiProperty({ example: 'PMP' })
  @Expose()
  pricingModel: string;

  @ApiProperty({ example: 'utility' })
  @Expose()
  category: string;

  @ApiProperty({ example: 'regular' })
  @Expose()
  type: string;
}
