import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CopyResult, LegacyLogsCopier } from './legacy-logs-copier';
import { LogOutboxRelay } from './log-outbox-relay';
import { LOG_STREAMS } from './log-tables';
import { LogsDatabase } from './logs-database';
import { LogsModeService } from './logs-mode.service';
import { ILogsHost, LOGS_HOST } from '../../application/ports/logs-host.ports';

export interface LogsMaintenanceReport {
  skipped?: string;
  outboxMoved?: number;
  copies?: CopyResult[];
  error?: string;
}

/**
 * Background upkeep (post-deploy + the relayLogs cron): moves outbox rows to the logs database, then continues each
 * stream's copy from the main database — finishing a first copy that has not completed, or catching up rows written
 * to the legacy tables while servers were switching. Bounded by a time budget; the next run continues.
 */
@Injectable()
export class LogsMaintenanceService {
  constructor(
    @Inject(LOGS_HOST) private readonly host: ILogsHost,
    private readonly db: LogsDatabase,
    private readonly relay: LogOutboxRelay,
    private readonly mode: LogsModeService,
    @InjectPinoLogger(LogsMaintenanceService.name) private readonly logger: PinoLogger,
  ) {}

  async run(budgetMs: number): Promise<LogsMaintenanceReport> {
    if (!this.db.dedicated)
      return { skipped: 'no dedicated logs database (LOGS_DB_HOST); logs stay in the main database' };
    const deadline = Date.now() + budgetMs;
    const report: LogsMaintenanceReport = { copies: [] };
    try {
      report.outboxMoved = await this.relay.flushAll(deadline);
      const copier = new LegacyLogsCopier(this.host.mainDataSource, await this.db.connection());
      for (const stream of LOG_STREAMS) {
        if (Date.now() >= deadline) break;
        const result = await copier.copy(stream, { deadline });
        if (result.completed) this.mode.markMigrated(stream);
        report.copies.push(result);
      }
      this.logger.info(report, 'Logs maintenance done');
    } catch (err) {
      report.error = (err as Error)?.message ?? String(err);
      this.logger.error({ err, report }, 'Logs maintenance failed');
    }
    return report;
  }
}
