import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { AI_ENTITY_CLASSES } from './entities/ai.entities';
import { AiConfig } from '../../ai.config';

/**
 * AI database — its own migrations and migrations table (`ai_migrations`), never mixed with the ByajBazaar schema.
 * Does not load .env itself: the app and the CLI data source (ai-data-source.cli.ts) decide where settings come from.
 */
export function aiDataSourceOptions(config = new AiConfig()): DataSourceOptions {
  const isLocal = config.db.host === 'localhost' || config.db.host === '127.0.0.1';
  return {
    type: 'postgres',
    host: config.db.host,
    port: config.db.port,
    username: config.db.username,
    password: config.db.password,
    database: config.db.database,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: ['error', 'warn', 'migration'],
    entities: AI_ENTITY_CLASSES,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    migrationsTableName: 'ai_migrations',
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectTimeoutMS: 5_000,
    // Serverless: keep the pool small; never let a slow AI database hold a request for long.
    extra: { max: 3, query_timeout: 15_000 },
  };
}
