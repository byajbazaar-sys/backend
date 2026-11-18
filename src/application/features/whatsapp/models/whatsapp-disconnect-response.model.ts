import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppDisconnectResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;
}
