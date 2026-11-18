import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppRegisterPhoneResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ example: 'CONNECTED' })
  @Expose()
  status: string;
}
