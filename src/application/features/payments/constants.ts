/**
 * API routes a shop can still use after the trial ends without a plan: signing in, paying,
 * its own profile/account, support and push registration. Everything else needs a trial or plan.
 */
const PAYWALL_EXEMPT_PATH_PATTERNS: RegExp[] = [
  /\/auth(\/|$)/,
  /\/payments(\/|$)/,
  /\/users(\/|$)/,
  /\/support(\/|$)/,
  /\/notifications(\/|$)/,
  /\/public\//,
  /\/webhooks\//,
  /\/pos\/sessions\/validate(\/|$)/,
];

export function isPaywallExemptPath(path: string): boolean {
  const normalized = path.split('?')[0];
  return PAYWALL_EXEMPT_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
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
