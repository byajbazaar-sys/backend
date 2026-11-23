import { NestFactory } from '@nestjs/core';
import { loadAppSettings } from '@shared-libs';
import { Context, Handler } from 'aws-lambda';

import { AppModule } from '../app.module';
import { IInboxService, INBOX_SERVICE, InboxWorkerPayload } from '../application';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

async function bootstrap() {
  if (cachedApp) return cachedApp;
  await loadAppSettings(); // settings from SSM (the Lambda env is capped at 4 KB)
  cachedApp = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  return cachedApp;
}

/**
 * Customer-chat worker (async invoke from the WhatsApp / Instagram webhooks): the assistant's turn for one customer
 * message — an answer from the shop's facts, or a hand-over that alerts the owner. Webhooks are acknowledged at once.
 */
export const handler: Handler = async (event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const payload = (typeof event === 'string' ? JSON.parse(event) : event) as InboxWorkerPayload;
  if (!payload?.messageId) throw new Error('Invalid inbox payload: messageId is required');
  const app = await bootstrap();
  await app.get<IInboxService>(INBOX_SERVICE).answer(payload);
  return { messageId: payload.messageId };
};
