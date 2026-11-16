/**
 * The logs service stores bill, transaction, WhatsApp message and activity logs in its own database, configured with
 * LOGS_DB_* env vars.
 * Without LOGS_DB_HOST (or when it points at the main database) everything stays in the main database exactly as
 * before, so ByajBazaar keeps working when the logs database is not set up.
 */
export class LogsConfig {
  readonly db = {
    host: env('LOGS_DB_HOST') ?? env('DB_HOST') ?? 'localhost',
    port: Number(env('LOGS_DB_PORT') ?? env('DB_PORT') ?? 5432),
    database: env('LOGS_DB_NAME') ?? env('DB_NAME') ?? 'byajbazaar_db',
    username: env('LOGS_DB_USER') ?? env('DB_USER') ?? 'postgres',
    password: env('LOGS_DB_PASS') ?? env('DB_PASS') ?? 'postgres',
    /** True when a separate logs database is configured. */
    dedicated: isDedicated(),
  };

  /** Connection attempts to the logs database give up after this long, so a down logs DB never stalls requests. */
  readonly connectTimeoutMs = Number(env('LOGS_DB_CONNECT_TIMEOUT_MS') ?? 5000) || 5000;
  /** After a connection failure, writes go straight to the main-database outbox for this long. */
  readonly circuitOpenMs = 30_000;
  /** How long a server trusts its cached view of which log streams have been migrated. */
  readonly modeCacheMs = 60_000;
}

function isDedicated(): boolean {
  const host = env('LOGS_DB_HOST');
  if (!host) return false;
  const sameHost = host === (env('DB_HOST') ?? 'localhost');
  const samePort = Number(env('LOGS_DB_PORT') ?? 5432) === Number(env('DB_PORT') ?? 5432);
  const sameDb = (env('LOGS_DB_NAME') ?? env('DB_NAME')) === env('DB_NAME');
  // Pointing LOGS_DB_* at the main database is the same as not configuring it.
  return !(sameHost && samePort && sameDb);
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
