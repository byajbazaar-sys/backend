import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { SeedingService } from '../infrastructure/persistence/seeds/seeding.service';

export const handler: Handler = async (_event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // 1. Run migrations
    const dataSource = app.get(DataSource);
    const migrations = await dataSource.runMigrations();
    console.log(`[PostDeploy] Migrations: ${migrations.length} run`);

    // 2. Run seeds
    const seedingService = app.get(SeedingService);
    await seedingService.runAsync();
    console.log('[PostDeploy] Seeds completed');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Post-deploy completed',
        migrationsRun: migrations.length,
        timestamp: new Date().toISOString(),
      }),
    };
  } finally {
    await app.close();
  }
};
