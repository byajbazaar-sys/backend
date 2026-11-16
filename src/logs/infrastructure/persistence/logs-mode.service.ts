import { Injectable } from '@nestjs/common';

import { LogStream } from './log-tables';
import { LogsDatabase } from './logs-database';
import { LogsConfig } from '../../logs.config';

/**
 * Where a stream's logs live right now:
 *  - legacy: the main database's tables, exactly as before the logs service. Always the case without a dedicated
 *    logs database, and — with one — until the stream's existing rows have been copied over.
 *  - logs: the logs database.
 * A stream switches once its first full copy completes (logs_sync_state.completed_at); servers notice within
 * LogsConfig.modeCacheMs and never switch back. Rows written to the legacy table in the meantime are picked up by the
 * next catch-up copy, so the switch loses nothing.
 */
export type LogStoreMode = 'legacy' | 'logs';

@Injectable()
export class LogsModeService {
  private readonly migrated = new Set<LogStream>();
  private checkedAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly db: LogsDatabase,
    private readonly config: LogsConfig,
  ) {}

  async of(stream: LogStream): Promise<LogStoreMode> {
    if (!this.db.dedicated) return 'legacy';
    if (this.migrated.has(stream)) return 'logs';
    if (Date.now() - this.checkedAt >= this.config.modeCacheMs) await this.refresh();
    return this.migrated.has(stream) ? 'logs' : 'legacy';
  }

  /** Called when this server completes a stream's copy itself. */
  markMigrated(stream: LogStream): void {
    this.migrated.add(stream);
  }

  private refresh(): Promise<void> {
    this.refreshing ??= (async (): Promise<void> => {
      try {
        const rows = await this.db.run((ds) =>
          ds.query<{ stream: LogStream }[]>(`SELECT stream FROM logs_sync_state WHERE completed_at IS NOT NULL`),
        );
        for (const row of rows) this.migrated.add(row.stream);
      } catch {
        // Schema not created yet, or the logs database is unreachable: keep using the main database for now.
      } finally {
        this.checkedAt = Date.now();
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
}
