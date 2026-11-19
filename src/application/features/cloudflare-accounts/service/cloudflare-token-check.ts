/** Result of checking an account ID + token against Cloudflare Workers AI. */
export interface CloudflareTokenCheck {
  valid: boolean;
  error?: string;
}
