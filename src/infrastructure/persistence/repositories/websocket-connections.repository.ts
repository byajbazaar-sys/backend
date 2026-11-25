import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { IsNull, Repository } from 'typeorm';

import { IWebSocketConnectionsRepository, WebSocketConnection, EDeviceType } from '../../../application';
import { WebSocketConnectionEntity } from '../entities';

@Injectable()
export class WebSocketConnectionsRepository implements IWebSocketConnectionsRepository {
  constructor(
    @InjectRepository(WebSocketConnectionEntity)
    private readonly repo: Repository<WebSocketConnectionEntity>,
  ) {}

  async create(data: WebSocketConnection): Promise<WebSocketConnection> {
    const entity = this.repo.create(data);
    const created = await this.repo.save(entity);
    return plainToInstance(WebSocketConnection, created, { excludeExtraneousValues: true });
  }

  async findByConnectionId(connectionId: string): Promise<WebSocketConnection> {
    const entity = await this.repo.findOne({ where: { connectionId } });
    if (!entity) return null;
    return plainToInstance(WebSocketConnection, entity, { excludeExtraneousValues: true });
  }

  async findActiveByUserId(userId: string, area?: string): Promise<WebSocketConnection[]> {
    const rows = await this.repo.find({
      where: { userId, disconnectedAt: IsNull() },
      order: { connectedAt: 'DESC' },
    });
    return rows
      .filter((entity) => !area || !entity.shopPermissions || (entity.shopPermissions[area] ?? 'none') !== 'none')
      .map((entity) => plainToInstance(WebSocketConnection, entity, { excludeExtraneousValues: true }));
  }

  async findActiveBySessionAndDevice(sessionId: string, deviceType: EDeviceType): Promise<WebSocketConnection> {
    const entity = await this.repo.findOne({
      where: { sessionId, deviceType, disconnectedAt: IsNull() },
      order: { connectedAt: 'DESC' },
    });
    if (!entity) return null;
    return plainToInstance(WebSocketConnection, entity, { excludeExtraneousValues: true });
  }

  async markDisconnected(connectionId: string): Promise<void> {
    await this.repo.update({ connectionId }, { disconnectedAt: new Date() });
  }

  async updateShopAccess(
    shopId: string,
    actorUserId: string,
    permissions: Record<string, string> | null,
  ): Promise<void> {
    const where = { userId: shopId, actorUserId, disconnectedAt: IsNull() };
    if (permissions) await this.repo.update(where, { shopPermissions: permissions });
    else await this.repo.update(where, { disconnectedAt: new Date() });
  }

  async updateSessionId(connectionId: string, sessionId: string): Promise<void> {
    await this.repo.update({ connectionId }, { sessionId });
  }

  async updateDeviceType(connectionId: string, deviceType: EDeviceType): Promise<void> {
    await this.repo.update({ connectionId }, { deviceType });
  }
}
