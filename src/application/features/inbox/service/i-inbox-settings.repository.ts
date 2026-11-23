import { InboxSettings } from '../domain';

export const INBOX_SETTINGS_REPOSITORY = 'INBOX_SETTINGS_REPOSITORY';

export interface IInboxSettingsRepository {
  find(userId: string): Promise<InboxSettings | null>;
  save(settings: InboxSettings): Promise<InboxSettings>;
}
