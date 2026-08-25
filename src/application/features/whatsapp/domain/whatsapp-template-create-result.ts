import { Expose } from 'class-transformer';

export class WhatsAppTemplateCreateResult {
  @Expose()
  success: boolean;

  @Expose()
  templateId: string;

  @Expose()
  status: string;
}
