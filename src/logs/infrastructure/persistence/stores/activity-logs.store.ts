import { Inject, Injectable } from '@nestjs/common';

import { ILogsHost, LOGS_HOST } from '../../../application/ports/logs-host.ports';
import { ActivityLogRow, insertLogRows, SqlExecutor } from '../log-tables';
import { LogWriter } from '../log-writer';
import { LogsDatabase } from '../logs-database';
import { LogsModeService } from '../logs-mode.service';

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

export type ActivityLogView = Omit<ActivityLogRow, 'createdAt'> & { createdAt: Date; performedByName: string | null };

/** activity_logs: dues / payments / marketing activity. Same table shape in the logs and the main database. */
@Injectable()
export class ActivityLogsStore {
  constructor(
    @Inject(LOGS_HOST) private readonly host: ILogsHost,
    private readonly db: LogsDatabase,
    private readonly mode: LogsModeService,
    private readonly writer: LogWriter,
  ) {}

  async append(rows: ActivityLogRow[]): Promise<void> {
    await this.writer.write({
      stream: 'activity',
      rows,
      legacy: async () => {
        await insertLogRows(this.host.activeTransaction() ?? this.host.mainDataSource, 'activity', rows);
      },
    });
  }

  async find(query: ActivityLogsQuery): Promise<{ items: ActivityLogView[]; totalCount: number }> {
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (query.category) add('category = ?', query.category);
    if (query.action) add('action = ?', query.action);
    if (query.entityType) add('entity_type = ?', query.entityType);
    if (query.entityId) add('entity_id = ?', query.entityId);
    if (query.userId) add('user_id = ?::uuid', query.userId);
    if (query.performedBy) add('performed_by = ?::uuid', query.performedBy);
    if (query.from) add('created_at >= ?::timestamptz', query.from.toISOString());
    if (query.to) add('created_at <= ?::timestamptz', query.to.toISOString());
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const read = (ex: SqlExecutor): Promise<[unknown, unknown]> =>
      Promise.all([
        ex.query(
          `SELECT id, category, action, entity_type AS "entityType", entity_id AS "entityId", user_id AS "userId",
                  performed_by AS "performedBy", channel, data, created_at AS "createdAt"
           FROM activity_logs ${filter}
           ORDER BY created_at DESC, id DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, query.limit, query.offset],
        ),
        ex.query(`SELECT count(*)::int AS "count" FROM activity_logs ${filter}`, params),
      ]);
    const [rows, counted] = (
      (await this.mode.of('activity')) === 'legacy'
        ? await read(this.host.mainDataSource)
        : await this.db.run((ds) => read(ds))
    ) as [Omit<ActivityLogView, 'performedByName'>[], { count: number }[]];

    const names = await this.host.userNames(rows.map((row) => row.performedBy));
    return {
      items: rows.map((row) => ({
        ...row,
        performedByName: row.performedBy ? (names.get(row.performedBy) ?? null) : null,
      })),
      totalCount: counted[0]?.count ?? 0,
    };
  }
}
