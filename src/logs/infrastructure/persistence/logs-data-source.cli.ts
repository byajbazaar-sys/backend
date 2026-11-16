import 'dotenv/config';
import { DataSource } from 'typeorm';

import { logsDataSourceOptions } from './logs-data-source';
import { LogsConfig } from '../../logs.config';

/**
 * For the TypeORM CLI (npm run logs:migration:*). Refuses to run without a dedicated logs database: LOGS_DB_* falls
 * back to the main database, where these migrations must never run (down would drop the main log tables).
 */
const config = new LogsConfig();
if (!config.db.dedicated) {
  throw new Error('LOGS_DB_HOST is not set (or points at the main database); refusing to run logs migrations.');
}

export default new DataSource(logsDataSourceOptions(config));
