import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  ITryOnService,
  TRY_ON_SERVICE,
  TryOnLambdaPayload,
} from '../application/features/try-on/try-on.service';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

async function bootstrap() {
  if (cachedApp) return cachedApp;
  cachedApp = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  return cachedApp;
}

/**
 * Long-running jewellery try-on worker (async invoke from API).
 * Timeout should be >= 120s — Gemini image gen often exceeds API Gateway 29s.
 */
export const handler: Handler = async (event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const payload =
    typeof event === 'string'
      ? (JSON.parse(event) as TryOnLambdaPayload)
      : (event as TryOnLambdaPayload);

  if (!payload?.jobId || !payload?.userId || !payload?.request) {
    throw new Error('Invalid try-on payload: jobId, userId, and request are required');
  }

  const app = await bootstrap();
  const tryOn = app.get<ITryOnService>(TRY_ON_SERVICE);
  const result = await tryOn.processJob(payload);
  return {
    jobId: result.jobId,
    status: result.status,
    imageCount: result.images?.length ?? 0,
    error: result.error,
  };
};
