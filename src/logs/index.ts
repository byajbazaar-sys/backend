/** Public surface of the logs service (used by AppModule, the cron and the post-deploy handler). */
export { LogsModule } from './logs.module';
export { LogsDatabase } from './infrastructure/persistence/logs-database';
export { LogsMaintenanceService } from './infrastructure/persistence/logs-maintenance.service';
export type { LogsMaintenanceReport } from './infrastructure/persistence/logs-maintenance.service';
