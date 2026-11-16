import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { MarketingConfig } from '../../marketing.config';
import { MARKETING_ENTITY_CLASSES } from './entities/marketing.entities';

export const MARKETING_ENTITIES = MARKETING_ENTITY_CLASSES;

/** Marketing database — its own migrations and migrations table, never mixed with the ByajBazaar schema. */
export function marketingDataSourceOptions(config = new MarketingConfig()): DataSourceOptions {
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
    entities: MARKETING_ENTITIES,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    migrationsTableName: 'marketing_migrations',
    ssl: isLocal ? false : { rejectUnauthorized: false },
    // Serverless: keep the pool small.
    extra: { max: 3 },
  };
}

/** For the TypeORM CLI (npm run marketing:migration:*). */
export default new DataSource(marketingDataSourceOptions());
