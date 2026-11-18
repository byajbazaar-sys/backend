import { ActivityLogEntry } from './activity-log-entry';

export const ACTIVITY_LOGGER = 'IActivityLogger';

/**
 * Append-only activity log for dues, payments and marketing, stored by the logs service (src/logs).
 * Inside a database transaction entries are written once it commits, and dropped if it rolls back.
 */
export interface IActivityLogger {
  /** Never throws: a logging failure is reported to the server log, never to the caller. */
  record(entry: ActivityLogEntry): Promise<void>;
  recordMany(entries: ActivityLogEntry[]): Promise<void>;
}
