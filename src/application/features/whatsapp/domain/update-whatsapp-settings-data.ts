import { Expose } from 'class-transformer';

export class UpdateWhatsAppSettingsData {
  @Expose()
  dueRemindersEnabled?: boolean;
}
