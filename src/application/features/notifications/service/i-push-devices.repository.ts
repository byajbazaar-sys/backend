import { PushDevice } from '../domain';

export const PUSH_DEVICES_REPOSITORY = 'PUSH_DEVICES_REPOSITORY';

export interface IPushDevicesRepository {
  /** Registers (or moves to this user) a device token. */
  upsert(userId: string, token: string, platform: string | null): Promise<PushDevice>;
  remove(userId: string, token: string): Promise<void>;
  listForUser(userId: string): Promise<PushDevice[]>;
  /** Tokens the push service reported as no longer registered. */
  removeTokens(tokens: string[]): Promise<void>;
}
