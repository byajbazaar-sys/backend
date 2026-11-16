import { NestFactory } from '@nestjs/core';
import { Context, Handler } from 'aws-lambda';
import { DataSource } from 'typeorm';

import { AppModule } from '../app.module';
import { SeedingService } from '../infrastructure/persistence/seeds/seeding.service';
import { MarketingDatabase } from '../marketing';

export const handler: Handler = async (_event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    // 1. Run migrations
    const dataSource = app.get(DataSource);
    const migrations = await dataSource.runMigrations();
    console.log(`[PostDeploy] Migrations: ${migrations.length} run`);

    // 1b. Marketing database (separate DB, own migrations table). A failure here must not block ByajBazaar.
    let marketingMigrations: number | string = 0;
    try {
      marketingMigrations = await app.get(MarketingDatabase).runMigrations();
      console.log(`[PostDeploy] Marketing migrations: ${marketingMigrations} run`);
    } catch (err) {
      marketingMigrations = `failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[PostDeploy] Marketing migrations failed:', err);
    }

    // 2. Run seeds
    const seedingService = app.get(SeedingService);
    await seedingService.runAsync();
    console.log('[PostDeploy] Seeds completed');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Post-deploy completed',
        migrationsRun: migrations.length,
        marketingMigrations,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('[PostDeploy] Failed:', err);
    throw err;
  } finally {
    if (app) {
      await app.close();
    }
  }
};
