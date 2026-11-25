import { apiPath } from '../../shops/domain/shop-permissions';

/**
 * API routes a shop can still use after the trial ends without a plan: signing in, paying,
 * its own profile/account, support and push registration. Everything else needs a trial or plan.
 *
 * `shops` is the person's shop list, invites and team: an invited member's own (unused) account has its own trial,
 * and once that ends they must still be able to list, join and switch into the shops they work in (those run on
 * the owner's plan, checked on every shop request).
 *
 * Matched against the start of the API path only ("customers/auth" is not exempt), so a path parameter can never
 * be used to skip the paywall.
 */
const PAYWALL_EXEMPT_PREFIXES = [
  'auth',
  'payments',
  'shops',
  'users',
  'support',
  'notifications',
  'public',
  'webhooks',
  'pos/sessions/validate',
];

export function isPaywallExemptPath(path: string): boolean {
  const normalized = apiPath(path);
  return PAYWALL_EXEMPT_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

/** Error code clients look for to open the plans screen. */
export const SUBSCRIPTION_REQUIRED_CODE = 'SUBSCRIPTION_REQUIRED';

export const RAZORPAY_WEBHOOK_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'refund.created',
  'refund.processed',
  'refund.failed',
  'invoice.paid',
  'invoice.partially_paid',
  'invoice.expired',
] as const;

export type RazorpayWebhookEventName = (typeof RAZORPAY_WEBHOOK_EVENTS)[number];
