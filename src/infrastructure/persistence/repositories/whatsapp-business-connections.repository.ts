import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import { ConnectWhatsAppBusinessData, SaveWhatsAppBusinessConnectionData, WhatsAppBusinessConnection } from '../../../application/features/whatsapp/domain';
import { EWhatsAppConnectionStatus } from '../../../application/features/whatsapp/enums';
import { IWhatsAppBusinessConnectionsRepository } from '../../../application/features/whatsapp/service/i-whatsapp-business-connections.repository';
import { WhatsAppBusinessConnectionEntity } from '../entities/whatsapp-business-connection.entity';

@Injectable()
export class WhatsAppBusinessConnectionsRepository implements IWhatsAppBusinessConnectionsRepository {
  constructor(
    @InjectRepository(WhatsAppBusinessConnectionEntity)
    private readonly repo: Repository<WhatsAppBusinessConnectionEntity>,
  ) {}

  async findByUserId(userId: string): Promise<WhatsAppBusinessConnection> {
    const row = await this.repo.findOne({ where: { userId } });
    return row ? this.map(row) : null;
  }

  async findByWabaAndPhoneNumberId(wabaId: string, phoneNumberId: string): Promise<WhatsAppBusinessConnection> {
    const row = await this.repo.findOne({
      where: {
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        connectionStatus: EWhatsAppConnectionStatus.Connected,
      },
    });
    return row ? this.map(row) : null;
  }

  async findEncryptedTokenByUserId(userId: string): Promise<string> {
    const row = await this.repo.findOne({
      where: { userId, connectionStatus: EWhatsAppConnectionStatus.Connected },
      select: ['accessTokenReference'],
    });
    return row?.accessTokenReference ?? null;
  }

  async upsertConnection(
    userId: string,
    data: SaveWhatsAppBusinessConnectionData,
    accessTokenReference: string,
  ): Promise<WhatsAppBusinessConnection> {
    const existing = await this.repo.findOne({ where: { userId } });
    const entity = existing
      ? Object.assign(existing, {
          wabaId: data.wabaId,
          phoneNumberId: data.phoneNumberId,
          displayPhoneNumber: data.displayPhoneNumber,
          businessName: data.businessName,
          connectionStatus: EWhatsAppConnectionStatus.Connected,
          accessTokenReference,
        })
      : this.repo.create({
          userId,
          wabaId: data.wabaId,
          phoneNumberId: data.phoneNumberId,
          displayPhoneNumber: data.displayPhoneNumber,
          businessName: data.businessName,
          connectionStatus: EWhatsAppConnectionStatus.Connected,
          accessTokenReference,
        });

    const saved = await this.repo.save(entity);
    return this.map(saved);
  }

  async updateStatus(userId: string, connectionStatus: EWhatsAppConnectionStatus): Promise<void> {
    await this.repo.update({ userId }, { connectionStatus });
  }

  private map(row: WhatsAppBusinessConnectionEntity): WhatsAppBusinessConnection {
    return plainToInstance(
      WhatsAppBusinessConnection,
      {
        id: row.id,
        userId: row.userId,
        wabaId: row.wabaId,
        phoneNumberId: row.phoneNumberId,
        displayPhoneNumber: row.displayPhoneNumber,
        businessName: row.businessName,
        connectionStatus: row.connectionStatus,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      { excludeExtraneousValues: true },
    );
  }
}
