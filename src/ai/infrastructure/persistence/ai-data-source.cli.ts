import 'dotenv/config';
import { DataSource } from 'typeorm';

import { aiDataSourceOptions } from './ai-data-source';

/** For the TypeORM CLI (npm run ai:migration:*). Uses AI_DB_*, falling back to the main database like the app. */
export default new DataSource(aiDataSourceOptions());
