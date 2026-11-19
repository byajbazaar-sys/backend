/** Activity-log actions (category CLOUDFLARE, entity cloudflare_account) — stored in the logs database. */
export enum ECloudflareAccountActivity {
  Added = 'CLOUDFLARE_ACCOUNT_ADDED',
  Updated = 'CLOUDFLARE_ACCOUNT_UPDATED',
  Removed = 'CLOUDFLARE_ACCOUNT_REMOVED',
  Verified = 'CLOUDFLARE_ACCOUNT_VERIFIED',
  CooldownCleared = 'CLOUDFLARE_ACCOUNT_COOLDOWN_CLEARED',
  CoolingDown = 'CLOUDFLARE_ACCOUNT_COOLING_DOWN',
  CallSucceeded = 'CLOUDFLARE_CALL_SUCCEEDED',
  CallFailed = 'CLOUDFLARE_CALL_FAILED',
}
