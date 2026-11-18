import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { WhatsAppTemplateSummaryResponseModel } from './whatsapp-template-summary-response.model';

export class WhatsAppTemplateListResponseModel {
  @ApiProperty({ type: [WhatsAppTemplateSummaryResponseModel] })
  @Expose()
  items: WhatsAppTemplateSummaryResponseModel[];
}
