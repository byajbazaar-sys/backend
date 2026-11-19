import { CloudflareAccount, CloudflareAccountStatus } from '../domain';

/** Whether an account is in the Workers AI rotation right now, and if not why. */
export function cloudflareAccountStatus(account: CloudflareAccount, now = Date.now()): CloudflareAccountStatus {
  if (!account.enabled) return 'DISABLED';
  if (!account.apiToken) return 'NO_TOKEN';
  if (account.cooldownUntil && account.cooldownUntil.getTime() > now) return 'COOLDOWN';
  return 'ACTIVE';
}
