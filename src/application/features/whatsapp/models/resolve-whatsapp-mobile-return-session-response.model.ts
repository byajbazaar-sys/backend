import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { WhatsAppConnectionResponseModel } from './whatsapp-connection-response.model';
export class ResolveWhatsAppMobileReturnSessionResponseModel {
  @ApiProperty({
    enum: ['connected', 'processing', 'expired', 'invalid'],
    example: 'connected',
  })
  @Expose()
  status: 'connected' | 'processing' | 'expired' | 'invalid';

  @ApiPropertyOptional({ type: WhatsAppConnectionResponseModel })
  @Expose()
  connection?: WhatsAppConnectionResponseModel | null;
}
