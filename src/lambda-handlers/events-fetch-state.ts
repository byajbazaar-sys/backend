import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IJewelleryEventService, JEWELLERY_EVENT_SERVICE } from '../application';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

async function bootstrap() {
  if (cachedApp) return cachedApp;
  cachedApp = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  return cachedApp;
}

/**
 * Step Functions Map worker — fetch jewellery events for one Indian state via Gemini.
 * Input: { state: "Madhya Pradesh" } | "Madhya Pradesh"
 */
export const handler: Handler = async (event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const state =
    typeof event === 'string'
      ? event
      : event && typeof event === 'object' && 'state' in event
        ? String((event as { state: unknown }).state)
        : '';

  if (!state.trim()) {
    throw new Error('state is required');
  }

  const app = await bootstrap();
  const eventsService = app.get<IJewelleryEventService>(JEWELLERY_EVENT_SERVICE);
  const events = await eventsService.fetchStateEvents(state.trim());

  return {
    state: state.trim(),
    events,
    count: events.length,
  };
};
