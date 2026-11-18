import { Inject, Injectable } from '@nestjs/common';

import { LogStream, SqlExecutor } from './log-tables';
import { ILogsHost, LOGS_HOST } from '../host';

/** What the outbox holds: log rows of a stream, or WhatsApp delivery-status updates waiting to be applied. */
export type OutboxStream = LogStream | 'whatsapp_status';

/** Every outbox entry carries its own id (idempotent moves) and creation time (order). */
export interface OutboxEntry {
  id: string;
  createdAt: string;
}

interface OutboxRow {
  id: string;
  stream: OutboxStream;
  payload: OutboxEntry;
}

/** Re-check for the outbox table this often until it exists (it is created by a main-database migration). */
const READINESS_RECHECK_MS = 30_000;
const MAX_ROWS_PER_INSERT = 500;

/**
 * Main-database table log_outbox. Logs written inside a main-database transaction land here (atomically with it) and
 * logs that could not reach the logs database wait here; LogOutboxRelay moves them to the logs database.
 */
@Injectable()
export class LogOutbox {
  private ready = false;
  private checkedAt = 0;

  constructor(@Inject(LOGS_HOST) private readonly host: ILogsHost) {}

  /** Whether the log_outbox table exists yet (before the main migration runs, logs use the legacy tables). */
  async isReady(): Promise<boolean> {
    if (this.ready) return true;
    if (Date.now() - this.checkedAt < READINESS_RECHECK_MS) return false;
    this.checkedAt = Date.now();
    try {
      const rows = await this.host.mainDataSource.query<{ ready: boolean }[]>(
        `SELECT to_regclass('public.log_outbox') IS NOT NULL AS "ready"`,
      );
      this.ready = rows[0]?.ready === true;
    } catch {
      this.ready = false;
    }
    return this.ready;
  }

  /** `executor` is the caller's transaction (atomic with it) or the main DataSource. */
  async add(executor: SqlExecutor, stream: OutboxStream, rows: OutboxEntry[]): Promise<void> {
    for (let start = 0; start < rows.length; start += MAX_ROWS_PER_INSERT) {
      const chunk = rows.slice(start, start + MAX_ROWS_PER_INSERT);
      const params: unknown[] = [];
      const tuples = chunk.map((row) => {
        params.push(row.id, stream, JSON.stringify(row), row.createdAt);
        const n = params.length;
        return `($${n - 3}::uuid, $${n - 2}, $${n - 1}::jsonb, $${n}::timestamptz)`;
      });
      await executor.query(
        `INSERT INTO log_outbox (id, stream, payload, created_at) VALUES ${tuples.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        params,
      );
    }
  }

  /**
   * Deletes rows that are already in the logs database. Rows another server is moving right now (locked by drain())
   * are skipped instead of waited for — that server deletes them.
   */
  async remove(ids: string[]): Promise<void> {
    await this.host.mainDataSource.query(
      `DELETE FROM log_outbox
       WHERE id IN (SELECT id FROM log_outbox WHERE id = ANY($1::uuid[]) FOR UPDATE SKIP LOCKED)`,
      [ids],
    );
  }

  /**
   * Moves a batch to the logs database: locks rows (skipping ones another server is moving), hands them to `move`,
   * deletes them, all in one main-database transaction. If `move` fails nothing is deleted and the rows are retried.
   * Returns how many rows were moved.
   */
  async drain(
    move: (stream: OutboxStream, rows: OutboxEntry[]) => Promise<void>,
    filter: { ids?: string[]; limit: number },
  ): Promise<number> {
    let claimed: string[] = [];
    try {
      return await this.host.mainDataSource.transaction(async (manager) => {
        const rows = await manager.query<OutboxRow[]>(
          `SELECT id, stream, payload FROM log_outbox
           ${filter.ids ? 'WHERE id = ANY($2::uuid[])' : ''}
           ORDER BY created_at, id
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          filter.ids ? [filter.limit, filter.ids] : [filter.limit],
        );
        if (rows.length === 0) return 0;
        claimed = rows.map((row) => row.id);

        // In outbox order, a run of same-stream entries at a time (a status update never overtakes its message).
        for (let start = 0; start < rows.length; ) {
          let end = start + 1;
          while (end < rows.length && rows[end].stream === rows[start].stream) end += 1;
          await move(
            rows[start].stream,
            rows.slice(start, end).map((row) => row.payload),
          );
          start = end;
        }

        await manager.query(`DELETE FROM log_outbox WHERE id = ANY($1::uuid[])`, [claimed]);
        return rows.length;
      });
    } catch (err) {
      if (claimed.length > 0) {
        await this.host.mainDataSource
          .query(
            `UPDATE log_outbox SET attempts = attempts + 1, last_error = $2, last_attempt_at = now()
             WHERE id = ANY($1::uuid[])`,
            [claimed, String((err as Error)?.message ?? err).slice(0, 2000)],
          )
          .catch(() => undefined);
      }
      throw err;
    }
  }
}
