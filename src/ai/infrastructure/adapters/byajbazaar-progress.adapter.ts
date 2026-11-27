import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  IWebSocketConnectionsRepository,
  IWebSocketMessageService,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
  WEBSOCKET_MESSAGE_SERVICE,
} from '../../../application';
import { AiProgressEvent, IAiProgressNotifier } from '../../application';

/** The person's live connections are looked up once per turn, not once per step. */
const CONNECTIONS_TTL_MS = 30_000;

/**
 * Turn progress over ByajBazaar's WebSocket API (the one POS, inbox and try-on use): `aiProgress` messages to the
 * person's own open connections in this shop — never to other members. API Gateway's HTTP API cannot stream a Lambda
 * response, so this is how the app shows "Looking up loans…" while the answer is prepared. Best effort: never throws.
 */
@Injectable()
export class ByajBazaarAiProgressNotifier implements IAiProgressNotifier {
  private readonly cache = new Map<string, { at: number; ids: string[] }>();

  constructor(
    @Inject(WEBSOCKET_CONNECTIONS_REPOSITORY) private readonly connections: IWebSocketConnectionsRepository,
    @Inject(WEBSOCKET_MESSAGE_SERVICE) private readonly messages: IWebSocketMessageService,
    @InjectPinoLogger(ByajBazaarAiProgressNotifier.name) private readonly logger: PinoLogger,
  ) {}

  async notify(target: { shopId: string; actorUserId: string }, event: AiProgressEvent): Promise<void> {
    if (!process.env.WEBSOCKET_API_ENDPOINT) return;
    try {
      const ids = await this.connectionIds(target);
      await Promise.all(
        ids.map((id) => this.messages.sendToConnection(id, { type: 'aiProgress', ...event }).catch(() => false)),
      );
    } catch (err) {
      this.logger.debug({ err: (err as Error).message }, 'AI progress not delivered');
    }
  }

  private async connectionIds(target: { shopId: string; actorUserId: string }): Promise<string[]> {
    const key = `${target.shopId}:${target.actorUserId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CONNECTIONS_TTL_MS) return hit.ids;
    const live = await this.connections.findActiveByUserId(target.shopId);
    const ids = live
      .filter((c) => (c.actorUserId ? c.actorUserId === target.actorUserId : target.actorUserId === target.shopId))
      .map((c) => c.connectionId);
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(key, { at: Date.now(), ids });
    return ids;
  }
}
