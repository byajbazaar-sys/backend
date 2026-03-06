import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import Entities from './entities';
import { IDbOptions } from './options';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

const DB_PORT = 5432;

export const generateDataSourceOptions = (options?: IDbOptions): DataSourceOptions => {
  const envPort = process.env?.DB_PORT;
  const port = envPort !== undefined && envPort !== '' ? Number(envPort) : undefined;

  const dataSource: DataSourceOptions = {
    type: 'postgres',
    host: options?.host ?? process.env?.DB_HOST ?? 'localhost',
    port: port ?? options?.port ?? DB_PORT,
    username: options?.username ?? process.env?.DB_USER ?? 'postgres',
    password: options?.password ?? process.env?.DB_PASS ?? 'postgres',
    database: options?.database ?? process.env?.DB_NAME ?? 'user_db',
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: true,
    entities: [...Entities],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
  };
  return dataSource;
};

export default new DataSource(generateDataSourceOptions());
