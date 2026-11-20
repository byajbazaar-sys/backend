import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadAppSettings } from '@shared-libs';
import { Context, Handler } from 'aws-lambda';

import { AppModule } from '../app.module';
import { MarketingPublishingService } from '../marketing';

let cachedApp: INestApplicationContext;

async function bootstrap(): Promise<INestApplicationContext> {
  if (cachedApp) return cachedApp;
  await loadAppSettings(); // settings from SSM (the Lambda env is capped at 4 KB)
  cachedApp = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  return cachedApp;
}

export const handler: Handler = async (
  _event: unknown,
  context: Context,
): Promise<Awaited<ReturnType<MarketingPublishingService['publishDuePosts']>>> => {
  context.callbackWaitsForEmptyEventLoop = false;
  const app = await bootstrap();
  return app.get(MarketingPublishingService).publishDuePosts();
};
