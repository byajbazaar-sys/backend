import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { v4 as uuid } from 'uuid';

import { ActivityLogEntry, IActivityLogger } from '../../../application';
import { ActivityLogRow } from '../domain';
import { currentLogsRequestContext } from '../logs-request-context';
import { ACTIVITY_LOGS_REPOSITORY, IActivityLogsRepository, ILogsTransaction, LOGS_TRANSACTION } from '../ports';
import { nextLogTimestamp } from '../utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ACTIVITY_LOGGER: the activity log's public entry point for ByajBazaar features and marketing. */
@Injectable()
export class ActivityLogger implements IActivityLogger {
  constructor(
    @Inject(LOGS_TRANSACTION) private readonly host: ILogsTransaction,
    @Inject(ACTIVITY_LOGS_REPOSITORY) private readonly store: IActivityLogsRepository,
    @InjectPinoLogger(ActivityLogger.name) private readonly logger: PinoLogger,
  ) {}

  record(entry: ActivityLogEntry): Promise<void> {
    return this.recordMany([entry]);
  }

  async recordMany(entries: ActivityLogEntry[]): Promise<void> {
    if (!entries?.length) return;
    try {
      const context = currentLogsRequestContext();
      const rows = entries.map((entry): ActivityLogRow => {
        const performedBy = entry.performedBy !== undefined ? entry.performedBy : (context?.actorId ?? null);
        return {
          id: uuid(),
          category: clip(entry.category, 20),
          action: clip(entry.action, 60),
          entityType: clip(entry.entityType, 40),
          entityId: entry.entityId !== undefined && entry.entityId !== null ? clip(entry.entityId, 128) : null,
          userId: asUuid(entry.userId),
          performedBy: asUuid(performedBy),
          channel: clip(entry.channel ?? context?.channel ?? 'system', 20),
          data: entry.data ?? {},
          createdAt: nextLogTimestamp(),
        };
      });
      // Activity describes committed work: inside a transaction, write once it commits (dropped on rollback).
      await this.host.afterCommit(async () => {
        try {
          await this.store.append(rows);
        } catch (err) {
          this.logger.error({ err, rows }, 'Failed to write activity log');
        }
      });
    } catch (err) {
      this.logger.error({ err, entries }, 'Failed to record activity log');
    }
  }
}

function clip(value: string, max: number): string {
  return String(value ?? '').slice(0, max);
}

function asUuid(value: string | null | undefined): string | null {
  return value && UUID.test(value) ? value : null;
}
