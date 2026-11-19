/** Areas that write to the activity log (table activity_logs in the logs database). */
export enum EActivityLogCategory {
  Due = 'DUE',
  Payment = 'PAYMENT',
  Marketing = 'MARKETING',
  /** Cloudflare Workers AI accounts (try-on, inventory background removal): admin changes and every AI call. */
  Cloudflare = 'CLOUDFLARE',
}
