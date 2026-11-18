import { ActivityLogRow } from '../domain';
import { ActivityLogView } from './activity-log-view';
import { ActivityLogsQuery } from './activity-logs-query';

export const ACTIVITY_LOGS_REPOSITORY = 'ACTIVITY_LOGS_REPOSITORY';

/** activity_logs storage (logs database, or the main database in legacy mode). */
export interface IActivityLogsRepository {
  append(rows: ActivityLogRow[]): Promise<void>;
  find(query: ActivityLogsQuery): Promise<{ items: ActivityLogView[]; totalCount: number }>;
}
