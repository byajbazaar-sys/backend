import { DataSourceOptions } from 'typeorm';

import { LogsConfig } from '../../logs.config';

/**
 * Logs database — its own migrations and migrations table, never mixed with the ByajBazaar schema. Accessed with
 * plain SQL (see log-tables.ts), so it has no entities. Does not load .env itself: the app, the CLI data source and
 * the migration script each decide where the settings come from.
 */
export function logsDataSourceOptions(config = new LogsConfig()): DataSourceOptions {
  const isLocal = config.db.host === 'localhost' || config.db.host === '127.0.0.1';
  return {
    type: 'postgres',
    host: config.db.host,
    port: config.db.port,
    username: config.db.username,
    password: config.db.password,
    database: config.db.database,
    synchronize: false,
    logging: ['error', 'warn', 'migration'],
    entities: [],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    migrationsTableName: 'logs_migrations',
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectTimeoutMS: config.connectTimeoutMs,
    // Serverless: keep the pool small; never let a slow logs database hold a request for long.
    extra: { max: 3, query_timeout: 20_000 },
  };
}
