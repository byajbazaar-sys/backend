/**
 * Seed CLI - Runs database seeds for a given stage.
 * Usage: STAGE=dev yarn seed  OR  yarn seed:dev  OR  ./scripts/seed.sh dev
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedingService } from '../infrastructure/persistence/seeds/seeding.service';

async function runSeed(): Promise<void> {
  const stage = process.env.STAGE || process.env.NODE_ENV || 'dev';

  // Load .env first (base), then .env.{stage} (stage-specific overrides)
  const defaultEnvPath = path.resolve(process.cwd(), '.env');
  const stageEnvPath = path.resolve(process.cwd(), `.env.${stage}`);

  dotenv.config({ path: defaultEnvPath });
  dotenv.config({ path: stageEnvPath, override: true });

  process.env.NODE_ENV = stage;
  process.env.STAGE = stage;

  console.log(`[Seed] Running seeds for stage: ${stage}`);
  console.log(`[Seed] MONGO_URL: ${process.env.MONGO_URL ? '***configured***' : 'NOT SET'}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const seedingService = app.get(SeedingService);
    await seedingService.runAsync();
    console.log('[Seed] All seeds completed successfully');
  } finally {
    await app.close();
  }
}

runSeed().catch((err) => {
  console.error('[Seed] Failed:', err?.message || err);
  process.exit(1);
});
