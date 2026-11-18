export interface ActivityLogsQuery {
  category?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  performedBy?: string;
  from?: Date;
  to?: Date;
  /** Already validated by the caller. */
  limit: number;
  offset: number;
}
