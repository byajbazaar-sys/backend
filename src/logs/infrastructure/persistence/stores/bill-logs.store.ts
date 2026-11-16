import { Inject, Injectable } from '@nestjs/common';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { v4 as uuid } from 'uuid';

import { BillLog, BillLogsQuery, IBillLogsRepository } from '../../../../application';
import { ILogsHost, LOGS_HOST } from '../../../application/ports/logs-host.ports';
import { BillLogRow, nextLogTimestamp } from '../log-tables';
import { LogWriter } from '../log-writer';
import { LogsDatabase } from '../logs-database';
import { LogsModeService } from '../logs-mode.service';

/** Bill history (BILL_LOGS_REPOSITORY), stored by the logs service. Same results as the main-database version. */
@Injectable()
export class BillLogsStore implements IBillLogsRepository {
  constructor(
    @Inject(LOGS_HOST) private readonly host: ILogsHost,
    private readonly db: LogsDatabase,
    private readonly mode: LogsModeService,
    private readonly writer: LogWriter,
  ) {}

  async create(log: BillLog): Promise<BillLog> {
    const row: BillLogRow = {
      id: uuid(),
      billId: log.billId ?? null,
      billNumber: log.billNumber,
      userId: log.userId,
      action: log.action,
      changes: (log.changes ?? []) as unknown[],
      snapshot: log.snapshot ?? null,
      channel: log.channel ?? null,
      performedBy: log.performedBy ?? null,
      createdAt: nextLogTimestamp(),
    };
    await this.writer.write({ stream: 'bill', rows: [row], legacy: () => this.host.legacy.createBillLog(log) });
    return plainToInstance(BillLog, { ...row, createdAt: new Date(row.createdAt) }, { excludeExtraneousValues: true });
  }

  async find(query: BillLogsQuery): Promise<Paged<BillLog>> {
    if ((await this.mode.of('bill')) === 'legacy') return this.host.legacy.findBillLogs(query);

    const { pageNumber, pageSize, skip } = getPaginationValues({
      pageNumber: query.pageNumber,
      pageSize: query.pageSize ?? 50,
    });
    const params: unknown[] = [query.userId];
    const where = ['user_id = $1::uuid'];
    if (query.billId) {
      params.push(query.billId);
      where.push(`bill_id = $${params.length}::uuid`);
    }
    if (query.action) {
      params.push(query.action);
      where.push(`action = $${params.length}`);
    }
    const filter = where.join(' AND ');

    const [rows, counted] = await this.db.run((ds) =>
      Promise.all([
        ds.query<(Omit<BillLogRow, 'createdAt'> & { createdAt: Date })[]>(
          `SELECT id, bill_id AS "billId", bill_number AS "billNumber", user_id AS "userId", action, changes,
                  snapshot, channel, performed_by AS "performedBy", created_at AS "createdAt"
           FROM bill_logs WHERE ${filter}
           ORDER BY created_at DESC, id DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, skip],
        ),
        ds.query<{ count: number }[]>(`SELECT count(*)::int AS "count" FROM bill_logs WHERE ${filter}`, params),
      ]),
    );

    const names = await this.host.userNames(rows.map((row) => row.performedBy));
    return toPaged(BillLog, {
      items: rows.map((row) => ({
        ...row,
        performedByName: row.performedBy ? (names.get(row.performedBy) ?? null) : null,
      })),
      page: pageNumber,
      perPage: pageSize,
      totalCount: counted[0]?.count ?? 0,
    });
  }
}
