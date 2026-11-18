import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class WhatsAppTemplateCreateResponseModel {
  @ApiProperty({ example: true })
  @Expose()
  success: boolean;

  @ApiProperty({ example: '123456789' })
  @Expose()
  templateId: string;

  @ApiProperty({ example: 'PENDING' })
  @Expose()
  status: string;
}
