import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ActivityLogsAdminController } from './application/controllers/activity-logs-admin.controller';
import { LogsRequestContextInterceptor } from './application/logs-request-context';
import { LOGS_HOST } from './application/ports/logs-host.ports';
import { ActivityLogger } from './application/services/activity-logger.service';
import { ByajBazaarLogsHostAdapter } from './infrastructure/adapters/byajbazaar-host.adapter';
import { loadLogsSettings } from './infrastructure/config/logs-settings.loader';
import { LogOutbox } from './infrastructure/persistence/log-outbox';
import { LogOutboxRelay } from './infrastructure/persistence/log-outbox-relay';
import { LogWriter } from './infrastructure/persistence/log-writer';
import { LogsDatabase } from './infrastructure/persistence/logs-database';
import { LogsMaintenanceService } from './infrastructure/persistence/logs-maintenance.service';
import { LogsModeService } from './infrastructure/persistence/logs-mode.service';
import { ActivityLogsStore } from './infrastructure/persistence/stores/activity-logs.store';
import { BillLogsStore } from './infrastructure/persistence/stores/bill-logs.store';
import { TransactionLogsStore } from './infrastructure/persistence/stores/transaction-logs.store';
import { WhatsAppMessagesStore } from './infrastructure/persistence/stores/whatsapp-messages.store';
import { LogsConfig } from './logs.config';
import { BILL_LOGS_REPOSITORY } from '../application/features/sales-bills/service/i-bill-logs.repository';
import { WHATSAPP_MESSAGES_REPOSITORY } from '../application/features/whatsapp/service/i-whatsapp-messages.repository';
import { TRANSACTION_LOGS_REPOSITORY } from '../application/shared/repository/i-transaction-logs.repository';
import { ACTIVITY_LOGGER } from '../application/shared/services/i-activity-logger';

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
