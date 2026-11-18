import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { LogOutbox, OutboxEntry, OutboxStream } from './log-outbox';
import { insertLogRows, LogRowByStream, LogStream } from './log-tables';
import { LogsDatabase } from './logs-database';
import { applyWhatsAppStatus, WhatsAppStatusOp } from './whatsapp-messages.sql';
import { ILogsHost, LOGS_HOST } from '../host';

const BATCH_SIZE = 200;

/** Moves logs from the main-database outbox to the logs database. Every step is idempotent (rows keep their ids). */
@Injectable()
export class LogOutboxRelay {
  constructor(
    private readonly outbox: LogOutbox,
    private readonly db: LogsDatabase,
    @Inject(LOGS_HOST) private readonly host: ILogsHost,
    @InjectPinoLogger(LogOutboxRelay.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Right after a commit: copies the rows that transaction put in the outbox (still in memory) to the logs database,
   * then deletes them from the outbox — two round trips, no lock held. Never throws: if either step fails the rows
   * stay in the outbox for flushAll(), and re-inserting them later is a no-op.
   */
  async flush<S extends LogStream>(stream: S, rows: LogRowByStream[S][]): Promise<void> {
    if (rows.length === 0 || !this.db.dedicated) return;
    try {
      await this.move(stream, rows);
      await this.outbox.remove(rows.map((row) => row.id));
    } catch (err) {
      this.logger.warn({ err, stream, count: rows.length }, 'Logs kept in the outbox; they will be moved later');
    }
  }

  /** Moves everything waiting in the outbox, until it is empty or `deadline` (epoch ms) passes. */
  async flushAll(deadline: number): Promise<number> {
    if (!this.db.dedicated || !(await this.outbox.isReady())) return 0;
    let moved = 0;
    while (Date.now() < deadline) {
      const count = await this.outbox.drain(this.move, { limit: BATCH_SIZE });
      moved += count;
      if (count < BATCH_SIZE) break;
    }
    return moved;
  }

  private readonly move = async (stream: OutboxStream, rows: OutboxEntry[]): Promise<void> => {
    if (stream === 'whatsapp_status') {
      for (const op of rows as WhatsAppStatusOp[]) await this.applyStatus(op);
      return;
    }
    await this.db.run((ds) => insertLogRows(ds, stream, rows as unknown as LogRowByStream[typeof stream][]));
  };

  /**
   * A delivery-status webhook that arrived while the logs database was unreachable: applied to the logs database,
   * or to the main-database table when the message has not been copied yet. Unknown messages are dropped, as the
   * webhook itself does.
   */
  private async applyStatus(op: WhatsAppStatusOp): Promise<void> {
    const applied = await this.db.run((ds) => applyWhatsAppStatus(ds, op.metaMessageId, op.update));
    if (!applied) await this.host.legacy.whatsapp.applyStatusUpdate(op.metaMessageId, op.update);
  }
}
