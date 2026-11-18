import { IsoTimestamp } from './iso-timestamp';

/** One activity_logs row (dues / payments / marketing activity). */
export interface ActivityLogRow {
  id: string;
  category: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  performedBy: string | null;
  channel: string | null;
  data: Record<string, unknown>;
  createdAt: IsoTimestamp;
}
