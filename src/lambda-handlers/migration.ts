import { Context, Handler } from 'aws-lambda';
import { DataSource } from 'typeorm';
import { generateDataSourceOptions } from '../infrastructure/persistence/type-orm.config';

export const handler: Handler = async (_event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const dataSource = new DataSource(generateDataSourceOptions());

  try {
    await dataSource.initialize();
    console.log('[Migration] Connected to database');

    const migrations = await dataSource.runMigrations();
    console.log(`[Migration] Ran ${migrations.length} migration(s):`, migrations.map((m) => m.name));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Migrations completed successfully',
        migrationsRun: migrations.length,
        migrations: migrations.map((m) => ({ name: m.name })),
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('[Migration] Failed:', error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
};
