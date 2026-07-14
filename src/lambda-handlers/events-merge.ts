import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  IJewelleryEventService,
  JEWELLERY_EVENT_SERVICE,
} from '../application';
import { DiscoveredEvent } from '../infrastructure/ai';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

async function bootstrap() {
  if (cachedApp) return cachedApp;
  cachedApp = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  return cachedApp;
}

type StateResult = {
  state?: string;
  events?: DiscoveredEvent[];
  count?: number;
};

/**
 * Step Functions merge task — combine Map outputs and upsert into jewellery_events.
 * Input: StateResult[] from Map state
 */
export const handler: Handler = async (event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const results = Array.isArray(event) ? (event as StateResult[]) : [];
  const flattened: DiscoveredEvent[] = [];
  for (const result of results) {
    if (Array.isArray(result?.events)) {
      flattened.push(...result.events);
    }
  }

  const app = await bootstrap();
  const eventsService = app.get<IJewelleryEventService>(JEWELLERY_EVENT_SERVICE);
  const { upserted } = await eventsService.mergeAndUpsert(flattened);

  return {
    states: results.map((r) => r.state).filter(Boolean),
    received: flattened.length,
    upserted,
    timestamp: new Date().toISOString(),
  };
};
