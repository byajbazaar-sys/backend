import { Expose } from 'class-transformer';

export class UpdateWhatsAppSettingsData {
  @Expose()
  dueRemindersEnabled?: boolean;

  @Expose()
  reengagementTemplateName?: string;

  @Expose()
  reengagementTemplateLanguage?: string;
}
