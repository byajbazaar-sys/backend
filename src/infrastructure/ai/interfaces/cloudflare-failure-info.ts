import { CloudflareCallInfo } from './cloudflare-call-info';

/** A failed Workers AI call, for the usage log and the account's cooldown. */
export interface CloudflareFailureInfo extends CloudflareCallInfo {
  status?: number;
  message: string;
  /** The account's daily free Workers AI allocation is used up. */
  quota: boolean;
}
