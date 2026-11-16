import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { LogOutbox } from './log-outbox';
import { LogOutboxRelay } from './log-outbox-relay';
import { insertLogRows, LogRowByStream, LogStream } from './log-tables';
import { LogsDatabase } from './logs-database';
import { LogsModeService } from './logs-mode.service';
import { ILogsHost, LOGS_HOST } from '../../application/ports/logs-host.ports';

export interface LogWrite<S extends LogStream> {
  stream: S;
  rows: LogRowByStream[S][];
  /** Writes the same logs to the stream's main-database (pre-logs-service) table. */
  legacy: () => Promise<void>;
  /**
   * false: never tie the write to the caller's transaction — for records of things that already happened outside the
   * database (a WhatsApp message Meta accepted must be recorded even if the surrounding transaction rolls back).
   */
  joinTransaction?: boolean;
}

/**
 * The one write path for logs. A log is never dropped while the main database is up:
 *  - stream not migrated yet (or no logs database) → main-database table, as before the logs service;
 *  - inside a main-database transaction → the main-database outbox, atomically with the transaction (rolled back
 *    together), then moved to the logs database right after the commit;
 *  - otherwise → the logs database; if it is unreachable → the outbox; if that table is missing → the legacy table.
 * Whatever lands in the outbox or a legacy table reaches the logs database later (relay / catch-up copy).
 */
@Injectable()
export class LogWriter {
  constructor(
    @Inject(LOGS_HOST) private readonly host: ILogsHost,
    private readonly db: LogsDatabase,
    private readonly mode: LogsModeService,
    private readonly outbox: LogOutbox,
    private readonly relay: LogOutboxRelay,
    @InjectPinoLogger(LogWriter.name) private readonly logger: PinoLogger,
  ) {}

  async write<S extends LogStream>(write: LogWrite<S>): Promise<void> {
    if (write.rows.length === 0) return;
    if ((await this.mode.of(write.stream)) === 'legacy') return write.legacy();

    const transaction = write.joinTransaction === false ? undefined : this.host.activeTransaction();
    if (transaction) {
      if (!(await this.outbox.isReady())) return write.legacy();
      await this.outbox.add(transaction, write.stream, write.rows);
      await this.host.afterCommit(() => this.relay.flush(write.stream, write.rows));
      return;
    }

    try {
      await this.db.run((ds) => insertLogRows(ds, write.stream, write.rows));
      return;
    } catch (err) {
      this.logger.warn(
        { err, stream: write.stream },
        'Logs database write failed; keeping the logs in the main database',
      );
    }
    if (await this.outbox.isReady()) {
      try {
        await this.outbox.add(this.host.mainDataSource, write.stream, write.rows);
        return;
      } catch (err) {
        this.logger.error({ err, stream: write.stream }, 'Outbox write failed; writing the legacy table');
      }
    }
    await write.legacy();
  }
}
