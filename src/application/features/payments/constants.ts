/** API routes that require an active subscription or trial. */
const PREMIUM_API_PATH_PATTERNS: RegExp[] = [
  /\/inventory(\/|$)/,
  /\/bills(\/|$)/,
  /\/metal-rates(\/|$)/,
  /\/pos\/sessions(\/|$)/,
  /\/try-on(\/|$)/,
];

const PREMIUM_API_PUBLIC_EXCEPTIONS: RegExp[] = [/\/pos\/sessions\/validate(\/|$)/];

export function isPremiumApiPath(path: string): boolean {
  const normalized = path.split('?')[0];
  if (PREMIUM_API_PUBLIC_EXCEPTIONS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return PREMIUM_API_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

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
  'invoice.paid',
  'invoice.partially_paid',
  'invoice.expired',
] as const;

export type RazorpayWebhookEventName = (typeof RAZORPAY_WEBHOOK_EVENTS)[number];
