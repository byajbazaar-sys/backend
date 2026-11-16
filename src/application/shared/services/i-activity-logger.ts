export const ACTIVITY_LOGGER = 'IActivityLogger';

/** Areas that write to the activity log (table activity_logs in the logs database). */
export enum EActivityLogCategory {
  Due = 'DUE',
  Payment = 'PAYMENT',
  Marketing = 'MARKETING',
}

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

/**
 * Append-only activity log for dues, payments and marketing, stored by the logs service (src/logs).
 * Inside a database transaction entries are written once it commits, and dropped if it rolls back.
 */
export interface IActivityLogger {
  /** Never throws: a logging failure is reported to the server log, never to the caller. */
  record(entry: ActivityLogEntry): Promise<void>;
  recordMany(entries: ActivityLogEntry[]): Promise<void>;
}
