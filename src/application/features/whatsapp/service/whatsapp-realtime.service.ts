import { Inject, Injectable } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WhatsAppMessage } from '../domain';
import {
  IWebSocketConnectionsRepository,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
} from '../../pos/service/i-websocket-connections.repository';
import { IWebSocketMessageService, WEBSOCKET_MESSAGE_SERVICE } from '../../../shared';
import { IWhatsAppRealtimeService } from './i-whatsapp-realtime.service';

@Injectable()
export class WhatsAppRealtimeService implements IWhatsAppRealtimeService {
  constructor(
    @Inject(WEBSOCKET_CONNECTIONS_REPOSITORY)
    private readonly connectionsRepo: IWebSocketConnectionsRepository,
    @Inject(WEBSOCKET_MESSAGE_SERVICE)
    private readonly wsMessage: IWebSocketMessageService,
    @InjectPinoLogger(WhatsAppRealtimeService.name) private readonly logger: PinoLogger,
  ) {}

  async notifyMessageUpdated(message: WhatsAppMessage): Promise<void> {
    await this.broadcastToUser(message.userId, {
      type: 'whatsappMessageStatusUpdated',
      message: this.serializeMessage(message),
    });
  }

  async notifyMessageCreated(message: WhatsAppMessage): Promise<void> {
    await this.broadcastToUser(message.userId, {
      type: 'whatsappMessageCreated',
      message: this.serializeMessage(message),
    });
  }

  private serializeMessage(message: WhatsAppMessage): Record<string, unknown> {
    return instanceToPlain(message, { excludeExtraneousValues: true }) as Record<string, unknown>;
  }

  private async broadcastToUser(userId: string, payload: Record<string, unknown>): Promise<void> {
    if (!process.env.WEBSOCKET_API_ENDPOINT) {
      return;
    }

    const connections = await this.connectionsRepo.findActiveByUserId(userId);
    if (!connections.length) {
      return;
    }

    const envelope = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    await Promise.all(
      connections.map(async (connection) => {
        try {
          const delivered = await this.wsMessage.sendToConnection(connection.connectionId, envelope);
          if (!delivered) {
            await this.connectionsRepo.markDisconnected(connection.connectionId);
          }
        } catch (err) {
          this.logger.warn(
            { err, userId, connectionId: connection.connectionId, type: payload.type },
            'Failed to push WhatsApp realtime event',
          );
        }
      }),
    );
  }
}
