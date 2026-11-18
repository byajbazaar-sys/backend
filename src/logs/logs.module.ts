import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import {
  LogsRequestContextInterceptor,
  ActivityLogsAdminController,
  ACTIVITY_LOGS_REPOSITORY,
  LOGS_TRANSACTION,
  ActivityLogger,
} from './application';
import {
  ByajBazaarLogsHostAdapter,
  loadLogsSettings,
  LOGS_HOST,
  LogOutbox,
  LogOutboxRelay,
  LogWriter,
  LogsDatabase,
  LogsMaintenanceService,
  LogsModeService,
  ActivityLogsStore,
  BillLogsStore,
  TransactionLogsStore,
  WhatsAppMessagesStore,
} from './infrastructure';
import { LogsConfig } from './logs.config';
import {
  BILL_LOGS_REPOSITORY,
  WHATSAPP_MESSAGES_REPOSITORY,
  TRANSACTION_LOGS_REPOSITORY,
  ACTIVITY_LOGGER,
} from '../application';

/**
 * Logs service — a self-contained bounded context, like marketing:
 *  - own database (LOGS_DB_*, own migrations table logs_migrations), settings from SSM on Lambda;
 *  - stores the bill history (BILL_LOGS_REPOSITORY), transaction edit history (TRANSACTION_LOGS_REPOSITORY), the
 *    WhatsApp message log (WHATSAPP_MESSAGES_REPOSITORY) and the activity log for dues, payments and marketing
 *    (ACTIVITY_LOGGER) — features keep using those interfaces;
 *  - depends on ByajBazaar only through application/ports, implemented by infrastructure/adapters.
 *
 * Nothing is lost when the logs database is missing or down: without LOGS_DB_* logs stay in the main database as
 * before; with it, writes that cannot reach it wait in the main-database outbox (log_outbox) and are moved later.
 * Existing rows are moved by scripts/migrate-logs-to-logs-db.ts (or automatically by post-deploy / the relayLogs
 * cron); each stream switches to the logs database only once its rows have all been copied.
 */
@Global()
@Module({
  controllers: [ActivityLogsAdminController],
  providers: [
    {
      provide: LogsConfig,
      useFactory: async (): Promise<LogsConfig> => {
        await loadLogsSettings();
        return new LogsConfig();
      },
    },
    LogsDatabase,
    { provide: LOGS_HOST, useClass: ByajBazaarLogsHostAdapter },
    LogsModeService,
    LogOutbox,
    LogOutboxRelay,
    LogWriter,
    LogsMaintenanceService,
    BillLogsStore,
    TransactionLogsStore,
    WhatsAppMessagesStore,
    ActivityLogsStore,
    { provide: ACTIVITY_LOGS_REPOSITORY, useExisting: ActivityLogsStore },
    { provide: LOGS_TRANSACTION, useExisting: LOGS_HOST },
    ActivityLogger,
    { provide: BILL_LOGS_REPOSITORY, useExisting: BillLogsStore },
    { provide: TRANSACTION_LOGS_REPOSITORY, useExisting: TransactionLogsStore },
    { provide: WHATSAPP_MESSAGES_REPOSITORY, useExisting: WhatsAppMessagesStore },
    { provide: ACTIVITY_LOGGER, useExisting: ActivityLogger },
    { provide: APP_INTERCEPTOR, useClass: LogsRequestContextInterceptor },
  ],
  exports: [
    BILL_LOGS_REPOSITORY,
    TRANSACTION_LOGS_REPOSITORY,
    WHATSAPP_MESSAGES_REPOSITORY,
    ACTIVITY_LOGGER,
    LogsDatabase,
    LogsMaintenanceService,
  ],
})
export class LogsModule {}
