/**
 * The log streams and how each is stored. Shared by the app (writes, outbox relay) and the migration script, so all
 * of them move rows the same way. Rows keep their id everywhere (legacy table → outbox → logs DB), which makes every
 * copy idempotent: inserts are ON CONFLICT (id) DO NOTHING — except WhatsApp messages, whose delivery status changes
 * after they are written: they are upserted on meta_message_id and only ever move the status forward.
 */

export const LOG_STREAMS = ['bill', 'transaction', 'activity', 'whatsapp'] as const;
export type LogStream = (typeof LOG_STREAMS)[number];

/** Timestamps travel as ISO-8601 UTC text with microseconds, so nothing shifts or rounds between databases. */
type IsoTimestamp = string;

export interface BillLogRow {
  id: string;
  billId: string | null;
  billNumber: string;
  userId: string;
  action: string;
  changes: unknown[];
  snapshot: Record<string, unknown> | null;
  channel: string | null;
  performedBy: string | null;
  createdAt: IsoTimestamp;
}

export interface TransactionLogRow {
  id: string;
  transactionId: string | null;
  loanId: string;
  /** Owner of the loan (the shop). Not in the legacy table, where ownership came from a join on loans. */
  userId: string | null;
  action: string;
  transactionType: string | null;
  previousAmount: string | number | null;
  newAmount: string | number | null;
  previousPaidIn: string | null;
  newPaidIn: string | null;
  loanVersion: number | null;
  performedBy: string;
  createdAt: IsoTimestamp;
}

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

/** WhatsApp message log (sent messages + delivery status from Meta's status webhooks). */
export interface WhatsAppMessageRow {
  id: string;
  userId: string;
  wabaId: string;
  phoneNumberId: string;
  metaMessageId: string;
  recipient: string;
  messageType: string | null;
  templateName: string | null;
  contextType: string | null;
  contextId: string | null;
  contextLabel: string | null;
  deliveryStatus: string;
  statusTimestamp: string | null;
  errorCode: number | null;
  errorTitle: string | null;
  errorMessage: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface LogRowByStream {
  bill: BillLogRow;
  transaction: TransactionLogRow;
  activity: ActivityLogRow;
  whatsapp: WhatsAppMessageRow;
}
export type LogRow = LogRowByStream[LogStream];

/** A DataSource, EntityManager or QueryRunner. */
export interface SqlExecutor {
  query(sql: string, parameters?: unknown[]): Promise<any>;
}

type Cast = 'uuid' | 'varchar' | 'jsonb' | 'numeric' | 'int' | 'timestamptz';

/**
 * SQL twin of shouldAdvanceWhatsAppMessageStatus (whatsapp enums): never downgrade sent → delivered → read; failed
 * can always be (re)applied; nothing replaces failed except failed. Keep both in sync.
 */
export function whatsappStatusAdvancesSql(current: string, incoming: string): string {
  const rank = (x: string): string =>
    `(CASE ${x} WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE 0 END)`;
  return `(${incoming} = ${current} OR ${incoming} = 'failed' OR (${current} IS DISTINCT FROM 'failed' AND ${rank(incoming)} > ${rank(current)}))`;
}

/** On a duplicate meta_message_id, apply only the status part, and only when it moves forward (as the webhook does). */
const W = '"whatsapp_messages"';
const wErr = (col: string): string =>
  `CASE WHEN EXCLUDED."delivery_status" = 'failed' THEN COALESCE(EXCLUDED."${col}", ${W}."${col}") ELSE ${W}."${col}" END`;
const wTs = `COALESCE(NULLIF(EXCLUDED."status_timestamp", ''), ${W}."status_timestamp")`;
const WHATSAPP_ON_CONFLICT = `
  ON CONFLICT ("meta_message_id") DO UPDATE SET
    "delivery_status" = EXCLUDED."delivery_status",
    "status_timestamp" = ${wTs},
    "error_code" = ${wErr('error_code')},
    "error_title" = ${wErr('error_title')},
    "error_message" = ${wErr('error_message')},
    "updated_at" = GREATEST(${W}."updated_at", EXCLUDED."updated_at")
  WHERE ${whatsappStatusAdvancesSql(`${W}."delivery_status"`, 'EXCLUDED."delivery_status"')}
    AND (${W}."delivery_status", ${W}."status_timestamp", ${W}."error_code", ${W}."error_title", ${W}."error_message")
        IS DISTINCT FROM
        (EXCLUDED."delivery_status", ${wTs}, ${wErr('error_code')}, ${wErr('error_title')}, ${wErr('error_message')})`;

/** Table + columns of each stream in the logs database ([column, row key, type]). */
export const LOG_TABLES: {
  [S in LogStream]: { table: string; columns: [string, keyof LogRowByStream[S], Cast][]; onConflict?: string };
} = {
  bill: {
    table: 'bill_logs',
    columns: [
      ['id', 'id', 'uuid'],
      ['bill_id', 'billId', 'uuid'],
      ['bill_number', 'billNumber', 'varchar'],
      ['user_id', 'userId', 'uuid'],
      ['action', 'action', 'varchar'],
      ['changes', 'changes', 'jsonb'],
      ['snapshot', 'snapshot', 'jsonb'],
      ['channel', 'channel', 'varchar'],
      ['performed_by', 'performedBy', 'uuid'],
      ['created_at', 'createdAt', 'timestamptz'],
    ],
  },
  transaction: {
    table: 'transaction_logs',
    columns: [
      ['id', 'id', 'uuid'],
      ['transaction_id', 'transactionId', 'uuid'],
      ['loan_id', 'loanId', 'uuid'],
      ['user_id', 'userId', 'uuid'],
      ['action', 'action', 'varchar'],
      ['transaction_type', 'transactionType', 'varchar'],
      ['previous_amount', 'previousAmount', 'numeric'],
      ['new_amount', 'newAmount', 'numeric'],
      ['previous_paid_in', 'previousPaidIn', 'varchar'],
      ['new_paid_in', 'newPaidIn', 'varchar'],
      ['loan_version', 'loanVersion', 'int'],
      ['performed_by', 'performedBy', 'uuid'],
      ['created_at', 'createdAt', 'timestamptz'],
    ],
  },
  activity: {
    table: 'activity_logs',
    columns: [
      ['id', 'id', 'uuid'],
      ['category', 'category', 'varchar'],
      ['action', 'action', 'varchar'],
      ['entity_type', 'entityType', 'varchar'],
      ['entity_id', 'entityId', 'varchar'],
      ['user_id', 'userId', 'uuid'],
      ['performed_by', 'performedBy', 'uuid'],
      ['channel', 'channel', 'varchar'],
      ['data', 'data', 'jsonb'],
      ['created_at', 'createdAt', 'timestamptz'],
    ],
  },
  whatsapp: {
    table: 'whatsapp_messages',
    columns: [
      ['id', 'id', 'uuid'],
      ['user_id', 'userId', 'uuid'],
      ['waba_id', 'wabaId', 'varchar'],
      ['phone_number_id', 'phoneNumberId', 'varchar'],
      ['meta_message_id', 'metaMessageId', 'varchar'],
      ['recipient', 'recipient', 'varchar'],
      ['message_type', 'messageType', 'varchar'],
      ['template_name', 'templateName', 'varchar'],
      ['context_type', 'contextType', 'varchar'],
      ['context_id', 'contextId', 'uuid'],
      ['context_label', 'contextLabel', 'varchar'],
      ['delivery_status', 'deliveryStatus', 'varchar'],
      ['status_timestamp', 'statusTimestamp', 'varchar'],
      ['error_code', 'errorCode', 'int'],
      ['error_title', 'errorTitle', 'varchar'],
      ['error_message', 'errorMessage', 'varchar'],
      ['created_at', 'createdAt', 'timestamptz'],
      ['updated_at', 'updatedAt', 'timestamptz'],
    ],
    onConflict: WHATSAPP_ON_CONFLICT,
  },
};

/** Keeps the bind-parameter count per statement well under PostgreSQL's 65535 limit. */
const MAX_ROWS_PER_INSERT = 500;

/**
 * Inserts rows into a stream's logs-database table (the main database's activity_logs has the same shape), skipping
 * ids that are already there (WhatsApp: merging the status forward). Returns how many rows were inserted or changed.
 */
export async function insertLogRows<S extends LogStream>(
  executor: SqlExecutor,
  stream: S,
  rows: LogRowByStream[S][],
): Promise<number> {
  const { table, columns, onConflict } = LOG_TABLES[stream] as {
    table: string;
    columns: [string, string, Cast][];
    onConflict?: string;
  };
  let inserted = 0;
  for (let start = 0; start < rows.length; start += MAX_ROWS_PER_INSERT) {
    const chunk = rows.slice(start, start + MAX_ROWS_PER_INSERT);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const values = columns.map(([, key, cast]) => {
        params.push(toParam((row as unknown as Record<string, unknown>)[key], cast));
        return `$${params.length}::${cast}`;
      });
      return `(${values.join(', ')})`;
    });
    const result = (await executor.query(
      `INSERT INTO "${table}" (${columns.map(([column]) => `"${column}"`).join(', ')})
       VALUES ${tuples.join(', ')}
       ${onConflict ?? 'ON CONFLICT ("id") DO NOTHING'}
       RETURNING "id"`,
      params,
    )) as unknown[];
    inserted += Array.isArray(result) ? result.length : 0;
  }
  return inserted;
}

function toParam(value: unknown, cast: Cast): unknown {
  if (value === undefined || value === null) return null;
  // node-postgres would send a JS array as a PostgreSQL array literal, not JSON.
  if (cast === 'jsonb') return JSON.stringify(value);
  // numeric: node-postgres sends numbers and numeric strings as text, keeping full precision.
  if (value instanceof Date) return value.toISOString();
  return value;
}

// ------------------------------------------------------------------------------------------------ legacy tables

/** Formats a timestamptz expression as ISO-8601 UTC with microseconds (independent of DateStyle / TimeZone). */
const isoUtc = (expr: string): string => `to_char((${expr}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * Reading a stream's rows from the main database (the pre-logs-service tables), for copying them to the logs
 * database. Rows are paged on `cursorColumn` (created_at; updated_at for WhatsApp messages, so a status change made
 * after a row was copied is copied again); `cursor` is that column in the table's own type, exact to the microsecond.
 * `key` is how a row is matched with its copy when verifying.
 */
export const LEGACY_TABLES: Record<
  LogStream,
  {
    table: string;
    alias: string;
    cursorColumn: 'created_at' | 'updated_at';
    cursorType: 'timestamp' | 'timestamptz';
    key: { column: string; field: string; cast: 'uuid' | 'varchar' };
    select: string;
  }
> = {
  bill: {
    table: 'bill_logs',
    alias: 'b',
    cursorColumn: 'created_at',
    cursorType: 'timestamptz',
    key: { column: 'id', field: 'id', cast: 'uuid' },
    select: `
      SELECT b.id, b.bill_id AS "billId", b.bill_number AS "billNumber", b.user_id AS "userId", b.action,
             b.changes, b.snapshot, b.channel, b.performed_by AS "performedBy",
             ${isoUtc('b.created_at')} AS "createdAt", ${isoUtc('b.created_at')} AS "cursor"
      FROM bill_logs b`,
  },
  transaction: {
    table: 'transaction_logs',
    alias: 't',
    cursorColumn: 'created_at',
    // created_at is "timestamp without time zone", written by now() in the server's TimeZone.
    cursorType: 'timestamp',
    key: { column: 'id', field: 'id', cast: 'uuid' },
    select: `
      SELECT t.id, t.transaction_id AS "transactionId", t.loan_id AS "loanId", l.created_by AS "userId",
             t.action::text AS action, t.transaction_type::text AS "transactionType",
             t.previous_amount::text AS "previousAmount", t.new_amount::text AS "newAmount",
             t.previous_paid_in::text AS "previousPaidIn", t.new_paid_in::text AS "newPaidIn",
             t.loan_version AS "loanVersion", t.performed_by AS "performedBy",
             ${isoUtc(`t.created_at AT TIME ZONE current_setting('TimeZone')`)} AS "createdAt",
             to_char(t.created_at, 'YYYY-MM-DD HH24:MI:SS.US') AS "cursor"
      FROM transaction_logs t
      LEFT JOIN loans l ON l.id = t.loan_id`,
  },
  activity: {
    table: 'activity_logs',
    alias: 'a',
    cursorColumn: 'created_at',
    cursorType: 'timestamptz',
    key: { column: 'id', field: 'id', cast: 'uuid' },
    select: `
      SELECT a.id, a.category, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
             a.user_id AS "userId", a.performed_by AS "performedBy", a.channel, a.data,
             ${isoUtc('a.created_at')} AS "createdAt", ${isoUtc('a.created_at')} AS "cursor"
      FROM activity_logs a`,
  },
  whatsapp: {
    table: 'whatsapp_messages',
    alias: 'w',
    cursorColumn: 'updated_at',
    cursorType: 'timestamptz',
    key: { column: 'meta_message_id', field: 'metaMessageId', cast: 'varchar' },
    select: `
      SELECT w.id, w.user_id AS "userId", w.waba_id AS "wabaId", w.phone_number_id AS "phoneNumberId",
             w.meta_message_id AS "metaMessageId", w.recipient, w.message_type AS "messageType",
             w.template_name AS "templateName", w.context_type AS "contextType", w.context_id AS "contextId",
             w.context_label AS "contextLabel", w.delivery_status AS "deliveryStatus",
             w.status_timestamp AS "statusTimestamp", w.error_code AS "errorCode", w.error_title AS "errorTitle",
             w.error_message AS "errorMessage", ${isoUtc('w.created_at')} AS "createdAt",
             ${isoUtc('w.updated_at')} AS "updatedAt", ${isoUtc('w.updated_at')} AS "cursor"
      FROM whatsapp_messages w`,
  },
};

/** Monotonic per process, so logs written in the same millisecond keep their order. */
let lastTimestampMs = 0;
export function nextLogTimestamp(): IsoTimestamp {
  const now = Date.now();
  lastTimestampMs = now > lastTimestampMs ? now : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}
