import { ESubscriptionStatus, Subscription } from '../domain';

/**
 * Whether a subscription row still pays for app access.
 * - active: billing is running.
 * - pending: Razorpay is retrying a failed charge; keep the shop working meanwhile.
 * - cancelled / halted with a period end still ahead: already paid until then.
 * - authenticated with a period end ahead: the first period was paid upfront (coupon) and
 *   recurring billing starts at that date.
 */
export function subscriptionGrantsAccess(sub: Subscription | null | undefined, now = new Date()): boolean {
  if (!sub) return false;
  if (sub.status === ESubscriptionStatus.Active || sub.status === ESubscriptionStatus.Pending) {
    return true;
  }
  if (
    sub.status === ESubscriptionStatus.Cancelled ||
    sub.status === ESubscriptionStatus.Halted ||
    sub.status === ESubscriptionStatus.Authenticated
  ) {
    const end = sub.currentEnd ? new Date(sub.currentEnd) : null;
    return !!end && end > now;
  }
  return false;
}
