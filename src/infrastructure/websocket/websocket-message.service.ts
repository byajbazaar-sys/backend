import { Injectable } from '@nestjs/common';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IWebSocketMessageService } from './i-websocket-message.service';

@Injectable()
export class WebSocketMessageService implements IWebSocketMessageService {
  private client: ApiGatewayManagementApiClient | null = null;

  constructor(@InjectPinoLogger(WebSocketMessageService.name) private readonly logger: PinoLogger) {}

  private getClient(): ApiGatewayManagementApiClient {
    if (!this.client) {
      const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
      if (!endpoint) {
        this.logger.warn('WEBSOCKET_API_ENDPOINT not set — WebSocket messaging disabled');
      }
      this.client = new ApiGatewayManagementApiClient({
        endpoint: endpoint ?? 'https://localhost',
      });
    }
    return this.client;
  }

  async sendToConnection(connectionId: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!process.env.WEBSOCKET_API_ENDPOINT) return false;

    try {
      await this.getClient().send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(payload)),
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof GoneException || (err as { name?: string })?.name === 'GoneException') {
        this.logger.warn({ connectionId }, 'Stale WebSocket connection');
        return false;
      }
      this.logger.error({ err, connectionId }, 'Failed to send WebSocket message');
      throw err;
    }
  }

  async probeConnection(connectionId: string): Promise<boolean> {
    return this.sendToConnection(connectionId, { type: 'ping' });
  }

  async broadcastToSession(
    desktopConnectionId: string | undefined,
    mobileConnectionId: string | undefined,
    payload: Record<string, unknown>,
    excludeConnectionId?: string,
  ): Promise<void> {
    const targets = [desktopConnectionId, mobileConnectionId].filter(
      (id): id is string => !!id && id !== excludeConnectionId,
    );
    await Promise.all(targets.map((id) => this.sendToConnection(id, payload)));
  }
}
