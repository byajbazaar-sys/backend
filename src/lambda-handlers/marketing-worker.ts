import { NestFactory } from '@nestjs/core';
import { loadAppSettings } from '@shared-libs';
import { Context, Handler } from 'aws-lambda';

import { AppModule } from '../app.module';
import { MarketingQueueConsumer, MarketingQueueMessage } from '../marketing';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

async function bootstrap() {
  if (cachedApp) return cachedApp;
  await loadAppSettings(); // settings from SSM (the Lambda env is capped at 4 KB)
  cachedApp = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  return cachedApp;
}

const STEPS = ['plan', 'image', 'logo', 'dispatch', 'watch', 'photoshoot'];

/**
 * Marketing worker (async invoke): the long Cloudflare steps — scene prompts + images, logo — and dispatch.
 * The API hands these over because an API request is capped at 29 s.
 */
export const handler: Handler = async (event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const message = (typeof event === 'string' ? JSON.parse(event) : event) as MarketingQueueMessage;
  if (!STEPS.includes(message?.step)) {
    throw new Error(`Invalid marketing payload: step must be one of ${STEPS.join(', ')}`);
  }
  const app = await bootstrap();
  await app.get(MarketingQueueConsumer).run(message);
  return { ok: true, step: message.step };
};
