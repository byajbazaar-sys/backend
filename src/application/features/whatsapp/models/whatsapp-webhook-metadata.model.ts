import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppWebhookMetadataModel {
  @ApiProperty({ example: '15556723762' })
  @Expose()
  displayPhoneNumber: string;

  @ApiProperty({ example: '1253758921161028' })
  @Expose()
  phoneNumberId: string;
}
