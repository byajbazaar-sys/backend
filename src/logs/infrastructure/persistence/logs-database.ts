import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';

import { logsDataSourceOptions } from './logs-data-source';
import { LogsConfig } from '../../logs.config';

export class LogsDatabaseUnavailableError extends Error {
  constructor(message = 'Logs database is unavailable') {
    super(message);
    this.name = 'LogsDatabaseUnavailableError';
  }
}

/** Errors that mean "cannot reach the database" (as opposed to a bad query). */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '08000',
  '08003',
  '08006',
]);

export function isConnectionError(err: unknown): boolean {
  if (err instanceof LogsDatabaseUnavailableError) return true;
  const e = err as { code?: string; message?: string };
  if (e?.code && CONNECTION_ERROR_CODES.has(e.code)) return true;
  return /timeout|terminated|connect/i.test(e?.message ?? '');
}

/**
 * Lazily-connected logs database. Connecting on first use (instead of at boot) means a missing or unreachable logs
 * DB only affects logs, never the rest of ByajBazaar. After a connection failure it is skipped for a short while
 * (writes then go to the main-database outbox) instead of every request waiting for a timeout.
 */
@Injectable()
export class LogsDatabase implements OnModuleDestroy {
  private dataSource: DataSource | null = null;
  private connecting: Promise<DataSource> | null = null;
  private unavailableUntil = 0;

  constructor(
    private readonly config: LogsConfig,
    @InjectPinoLogger(LogsDatabase.name) private readonly logger: PinoLogger,
  ) {}

  /** False when LOGS_DB_* is not set: logs then live in the main database, as before the logs service. */
  get dedicated(): boolean {
    return this.config.db.dedicated;
  }

  async connection(): Promise<DataSource> {
    if (!this.dedicated) throw new Error('No dedicated logs database is configured (LOGS_DB_HOST)');
    if (this.dataSource?.isInitialized) {
      if (Date.now() < this.unavailableUntil) throw new LogsDatabaseUnavailableError();
      return this.dataSource;
    }
    if (Date.now() < this.unavailableUntil) throw new LogsDatabaseUnavailableError();
    if (this.connecting === null) {
      const ds = new DataSource(logsDataSourceOptions(this.config));
      this.connecting = ds
        .initialize()
        .then((ready) => {
          this.dataSource = ready;
          this.logger.info('Logs database connected');
          return ready;
        })
        .catch((err: unknown) => {
          this.markUnavailable(err);
          throw err;
        })
        .finally(() => {
          this.connecting = null;
        });
    }
    return this.connecting;
  }

  /** Runs `work` on the logs database; connection failures open the circuit for a while. */
  async run<T>(work: (ds: DataSource) => Promise<T>): Promise<T> {
    const ds = await this.connection();
    try {
      return await work(ds);
    } catch (err) {
      if (isConnectionError(err)) this.markUnavailable(err);
      throw err;
    }
  }

  /** Runs pending logs-database migrations (post-deploy). No-op without a dedicated logs database. */
  async runMigrations(): Promise<number> {
    if (!this.dedicated) return 0;
    const ran = await (await this.connection()).runMigrations({ transaction: 'each' });
    return ran.length;
  }

  private markUnavailable(err: unknown): void {
    this.unavailableUntil = Date.now() + this.config.circuitOpenMs;
    this.logger.warn({ err }, `Logs database unreachable; using the outbox for ${this.config.circuitOpenMs / 1000}s`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) await this.dataSource.destroy();
  }
}
