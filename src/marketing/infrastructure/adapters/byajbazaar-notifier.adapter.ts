import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  IWebSocketConnectionsRepository,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
  IWebSocketMessageService,
  WEBSOCKET_MESSAGE_SERVICE,
} from '../../../application';
import { IMarketingNotifier } from '../../application';

/** Pushes to the user's open ByajBazaar sessions over the existing AWS API Gateway WebSocket. */
@Injectable()
export class ByajBazaarNotifierAdapter implements IMarketingNotifier {
  constructor(
    @Inject(WEBSOCKET_CONNECTIONS_REPOSITORY) private readonly connectionsRepo: IWebSocketConnectionsRepository,
    @Inject(WEBSOCKET_MESSAGE_SERVICE) private readonly wsMessage: IWebSocketMessageService,
    @InjectPinoLogger(ByajBazaarNotifierAdapter.name) private readonly logger: PinoLogger,
  ) {}

  async notifyUser(userId: string, payload: Record<string, unknown>): Promise<void> {
    if (!process.env.WEBSOCKET_API_ENDPOINT) return;
    try {
      const connections = await this.connectionsRepo.findActiveByUserId(userId, 'marketing');
      await Promise.all(
        connections.map(async (c) => {
          const delivered = await this.wsMessage.sendToConnection(c.connectionId, payload).catch(() => false);
          if (!delivered) await this.connectionsRepo.markDisconnected(c.connectionId);
        }),
      );
    } catch (err) {
      this.logger.warn({ err, userId, type: payload.type }, 'Failed to push marketing update');
    }
  }

  async notifyConnection(connectionId: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!process.env.WEBSOCKET_API_ENDPOINT) return false;
    return this.wsMessage.sendToConnection(connectionId, payload).catch(() => false);
  }
}
