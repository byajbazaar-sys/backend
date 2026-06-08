import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  WEBSOCKET_HANDLER_SERVICE,
  IWebSocketHandlerService,
} from '../application/features/inventory/service';

let cachedApp: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

export async function getWebSocketApp() {
  if (cachedApp) return cachedApp;
  cachedApp = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  return cachedApp;
}

export async function getWebSocketHandler(): Promise<IWebSocketHandlerService> {
  const app = await getWebSocketApp();
  return app.get<IWebSocketHandlerService>(WEBSOCKET_HANDLER_SERVICE);
}

export function getTokenFromEvent(event: {
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined> | null;
}): string | undefined {
  const qs = event.queryStringParameters ?? {};
  const headers = event.headers ?? {};
  return qs.token ?? qs.users_token ?? headers.Authorization?.replace('Bearer ', '');
}

export function parseBody(event: { body?: string | null }): Record<string, unknown> {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function wsResponse(statusCode: number, body?: Record<string, unknown>) {
  return {
    statusCode,
    body: body ? JSON.stringify(body) : undefined,
  };
}
