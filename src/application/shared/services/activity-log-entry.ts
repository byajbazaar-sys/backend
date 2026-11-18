import { EActivityLogCategory } from './e-activity-log-category.enum';

export interface ActivityLogEntry {
  category: EActivityLogCategory;
  /** What happened, e.g. REMINDER_SENT, REFUND_CREATED, CAMPAIGN_FAILED (max 60 chars). */
  action: string;
  /** What it happened to: due, subscription, payment, coupon, campaign… (max 40 chars). */
  entityType: string;
  entityId?: string | null;
  /** The shop the entry belongs to (ByajBazaar user id), when there is one. */
  userId?: string | null;
  /** Who did it. Defaults to the signed-in user of the current request; null for jobs and webhooks. */
  performedBy?: string | null;
  /** web | mobile | api | webhook | system. Defaults to the current request's channel, else system. */
  channel?: string | null;
  /** Extra details. Never put secrets (keys, tokens, passwords) here. */
  data?: Record<string, unknown>;
}
