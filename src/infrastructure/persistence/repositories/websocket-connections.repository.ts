import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { WebSocketConnectionEntity } from '../entities/websocket-connection.entity';
import { IWebSocketConnectionsRepository, WebSocketConnection } from '../../../application';
import { EDeviceType } from '../../../application';

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

  async findByConnectionId(connectionId: string): Promise<WebSocketConnection | null> {
    const entity = await this.repo.findOne({ where: { connectionId } });
    if (!entity) return null;
    return plainToInstance(WebSocketConnection, entity, { excludeExtraneousValues: true });
  }

  async findActiveBySessionAndDevice(
    sessionId: string,
    deviceType: EDeviceType,
  ): Promise<WebSocketConnection | null> {
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

  async updateSessionId(connectionId: string, sessionId: string): Promise<void> {
    await this.repo.update({ connectionId }, { sessionId });
  }

  async updateDeviceType(connectionId: string, deviceType: EDeviceType): Promise<void> {
    await this.repo.update({ connectionId }, { deviceType });
  }
}
