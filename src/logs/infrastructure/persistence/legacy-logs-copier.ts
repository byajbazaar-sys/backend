import { insertLogRows, LEGACY_TABLES, LOG_TABLES, LogRowByStream, LogStream, SqlExecutor } from './log-tables';
import { EWhatsAppMessageDeliveryStatus, shouldAdvanceWhatsAppMessageStatus } from '../../../application';

const MIN_UUID = '00000000-0000-0000-0000-000000000000';
/**
 * Every resumed copy re-reads this much before its saved cursor. A legacy row's created_at is when its transaction
 * started (now() inside a payment transaction), so a row can commit after the copy has already read past its
 * timestamp; re-reading the recent window picks it up. Already-copied rows are skipped (WhatsApp: merged forward).
 */
const RESUME_OVERLAP = '10 minutes';

export interface CopyResult {
  stream: LogStream;
  /** Rows newly inserted into the logs database (WhatsApp: or whose status moved forward). */
  copied: number;
  /** Rows read from the main database (already-copied ones included). */
  scanned: number;
  /** True when the copy reached the end of the legacy table. */
  completed: boolean;
}

export interface VerifyResult {
  stream: LogStream;
  legacyCount: number;
  logsCount: number;
  compared: number;
  missing: string[];
  mismatched: string[];
}

interface SyncState {
  cursorCreatedAt: string | null;
  cursorId: string | null;
  completedAt: Date | null;
}

type LegacyRow = Record<string, unknown> & { id: string; cursor: string };

/**
 * Copies a stream's rows from the main database's legacy table (bill_logs / transaction_logs / activity_logs) to the
 * logs database, oldest first, in keyset batches. Progress is saved in logs_sync_state after every batch, so a copy
 * can stop at any point (time budget, crash) and resume. Inserts skip ids already present, so re-running is always
 * safe. Legacy rows are never modified or deleted.
 *
 * Used by scripts/migrate-logs-to-logs-db.ts (bulk copy + verification) and by LogsMaintenanceService (post-deploy and
 * the relayLogs cron: finishes an interrupted copy, then picks up rows written to legacy tables during the switch).
 */
export class LegacyLogsCopier {
  constructor(
    private readonly main: SqlExecutor,
    private readonly logs: SqlExecutor,
  ) {}

  async copy(
    stream: LogStream,
    options: { batchSize?: number; deadline?: number; onBatch?: (result: CopyResult) => void } = {},
  ): Promise<CopyResult> {
    const batchSize = options.batchSize ?? 500;
    const source = LEGACY_TABLES[stream];
    const result: CopyResult = { stream, copied: 0, scanned: 0, completed: false };

    if (!(await tableExists(this.main, source.table))) {
      // Nothing was ever written there (e.g. activity_logs before its migration).
      await this.saveState(stream, null, 0, true);
      return { ...result, completed: true };
    }

    const state = await this.loadState(stream);
    let cursor: { createdAt: string | null; id: string } = { createdAt: null, id: MIN_UUID };
    if (state?.cursorCreatedAt) {
      cursor = { createdAt: await this.rewind(stream, state.cursorCreatedAt), id: MIN_UUID };
    }

    const a = source.alias;
    const c = `${a}.${source.cursorColumn}`;
    for (;;) {
      if (options.deadline && Date.now() >= options.deadline) return result;
      const rows = (await this.main.query(
        `${source.select}
         WHERE (${c}, ${a}.id) > ($1::${source.cursorType}, $2::uuid)
         ORDER BY ${c}, ${a}.id
         LIMIT $3`,
        [cursor.createdAt ?? '-infinity', cursor.id, batchSize],
      )) as LegacyRow[];
      if (rows.length === 0) break;

      const inserted = await insertLogRows(
        this.logs,
        stream,
        rows.map(withoutCursor) as unknown as LogRowByStream[typeof stream][],
      );
      const last = rows[rows.length - 1];
      cursor = { createdAt: last.cursor, id: last.id };
      await this.saveState(stream, cursor, inserted, false);
      result.copied += inserted;
      result.scanned += rows.length;
      options.onBatch?.({ ...result });
      if (rows.length < batchSize) break;
    }

    await this.saveState(stream, null, 0, true);
    return { ...result, completed: true };
  }

  /** Compares every legacy row with its copy in the logs database, field by field. */
  async verify(stream: LogStream, options: { batchSize?: number } = {}): Promise<VerifyResult> {
    const batchSize = options.batchSize ?? 1000;
    const source = LEGACY_TABLES[stream];
    const target = LOG_TABLES[stream].table;
    const result: VerifyResult = { stream, legacyCount: 0, logsCount: 0, compared: 0, missing: [], mismatched: [] };

    result.logsCount = await count(this.logs, target);
    if (!(await tableExists(this.main, source.table))) return result;
    result.legacyCount = await count(this.main, source.table);

    const a = source.alias;
    let lastId = MIN_UUID;
    for (;;) {
      const rows = (await this.main.query(`${source.select} WHERE ${a}.id > $1::uuid ORDER BY ${a}.id LIMIT $2`, [
        lastId,
        batchSize,
      ])) as LegacyRow[];
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].id;

      const { key } = source;
      const copies = (await this.logs.query(`${logsSelect(stream)} WHERE "${key.column}" = ANY($1::${key.cast}[])`, [
        rows.map((row) => row[key.field]),
      ])) as Record<string, unknown>[];
      const byKey = new Map(copies.map((row) => [row[key.field] as string, row]));
      for (const legacyRow of rows) {
        const row = withoutCursor(legacyRow);
        result.compared += 1;
        const copy = byKey.get(legacyRow[key.field] as string);
        if (!copy) result.missing.push(legacyRow.id);
        else if (!sameRow(stream, row, copy)) result.mismatched.push(legacyRow.id);
      }
      if (rows.length < batchSize) break;
    }
    return result;
  }

  private async loadState(stream: LogStream): Promise<SyncState | null> {
    const rows = (await this.logs.query(
      `SELECT cursor_created_at AS "cursorCreatedAt", cursor_id AS "cursorId", completed_at AS "completedAt"
       FROM logs_sync_state WHERE stream = $1`,
      [stream],
    )) as SyncState[];
    return rows[0] ?? null;
  }

  /** `cursor` null keeps the saved one; completion is recorded once and never undone. */
  private async saveState(
    stream: LogStream,
    cursor: { createdAt: string | null; id: string } | null,
    copied: number,
    completed: boolean,
  ): Promise<void> {
    await this.logs.query(
      `INSERT INTO logs_sync_state (stream, cursor_created_at, cursor_id, copied, completed_at, updated_at)
       VALUES ($1, $2, $3::uuid, $4, CASE WHEN $5::boolean THEN now() END, now())
       ON CONFLICT (stream) DO UPDATE SET
         cursor_created_at = COALESCE(EXCLUDED.cursor_created_at, logs_sync_state.cursor_created_at),
         cursor_id = COALESCE(EXCLUDED.cursor_id, logs_sync_state.cursor_id),
         copied = logs_sync_state.copied + EXCLUDED.copied,
         completed_at = COALESCE(logs_sync_state.completed_at, EXCLUDED.completed_at),
         updated_at = now()`,
      [stream, cursor?.createdAt ?? null, cursor?.id ?? null, copied, completed],
    );
  }

  private async rewind(stream: LogStream, cursorCreatedAt: string): Promise<string> {
    const sql =
      LEGACY_TABLES[stream].cursorType === 'timestamp'
        ? `SELECT to_char($1::timestamp - interval '${RESUME_OVERLAP}', 'YYYY-MM-DD HH24:MI:SS.US') AS "c"`
        : `SELECT to_char(($1::timestamptz - interval '${RESUME_OVERLAP}') AT TIME ZONE 'UTC',
                          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "c"`;
    const rows = (await this.main.query(sql, [cursorCreatedAt])) as { c: string }[];
    return rows[0].c;
  }
}

/** The row without its paging cursor (which is not a column). */
function withoutCursor(row: LegacyRow): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  delete copy.cursor;
  return copy;
}

async function tableExists(executor: SqlExecutor, table: string): Promise<boolean> {
  const rows = (await executor.query(`SELECT to_regclass($1) IS NOT NULL AS "exists"`, [`public.${table}`])) as {
    exists: boolean;
  }[];
  return rows[0]?.exists === true;
}

async function count(executor: SqlExecutor, table: string): Promise<number> {
  const rows = (await executor.query(`SELECT count(*)::bigint::text AS "count" FROM "${table}"`)) as {
    count: string;
  }[];
  return Number(rows[0]?.count ?? 0);
}

/** A stream's logs-database rows in the same shape (and text formats) as LEGACY_TABLES selects. */
function logsSelect(stream: LogStream): string {
  const { table, columns } = LOG_TABLES[stream] as { table: string; columns: [string, string, string][] };
  const fields = columns.map(([column, key, cast]) => {
    if (cast === 'numeric') return `"${column}"::text AS "${key}"`;
    if (cast === 'timestamptz') {
      return `to_char("${column}" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "${key}"`;
    }
    return `"${column}" AS "${key}"`;
  });
  return `SELECT ${fields.join(', ')} FROM "${table}"`;
}

/**
 * Legacy columns with ON DELETE SET NULL foreign keys: deleting the transaction / user nulls them in the main database
 * after the row was copied, while the logs database rightly keeps the original id. Not a difference.
 */
const NULLED_BY_FOREIGN_KEYS: Record<LogStream, string[]> = {
  bill: ['performedBy'],
  transaction: ['transactionId'],
  activity: [],
  whatsapp: [],
};

/**
 * WhatsApp delivery status keeps changing after a row is copied (in the logs database once the stream has switched),
 * so those fields only need the copy to be at least as far along as the main-database row. The id may differ when
 * the same Meta message was recorded on both sides; rows are matched on meta_message_id.
 */
const WHATSAPP_STATUS_FIELDS = [
  'id',
  'deliveryStatus',
  'statusTimestamp',
  'errorCode',
  'errorTitle',
  'errorMessage',
  'updatedAt',
];

function sameRow(stream: LogStream, row: Record<string, unknown>, copy: Record<string, unknown>): boolean {
  if (stream !== 'whatsapp') return stableJson(normalize(stream, row, copy)) === stableJson(normalize(stream, copy));
  const immutable = (r: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(normalize(stream, r)).filter(([k]) => !WHATSAPP_STATUS_FIELDS.includes(k)));
  if (stableJson(immutable(row)) !== stableJson(immutable(copy))) return false;
  const legacyStatus = row.deliveryStatus as EWhatsAppMessageDeliveryStatus;
  const copyStatus = copy.deliveryStatus as EWhatsAppMessageDeliveryStatus;
  // Different only if the main database is ahead of the copy (a status change not copied yet).
  return legacyStatus === copyStatus || !shouldAdvanceWhatsAppMessageStatus(copyStatus, legacyStatus);
}

/** Row → comparable object. With `copy`, a legacy null on a SET NULL column accepts the copy's original value. */
function normalize(
  stream: LogStream,
  row: Record<string, unknown>,
  copy?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [, key] of LOG_TABLES[stream].columns as [string, string, string][]) {
    const value = row[key] ?? null;
    out[key] = value === null && copy && NULLED_BY_FOREIGN_KEYS[stream].includes(key) ? (copy[key] ?? null) : value;
  }
  return out;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}
