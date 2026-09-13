import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getPaginationValues, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  SaveWhatsAppOutboundMessageData,
  UpdateWhatsAppMessageStatusData,
  WhatsAppMessage,
} from '../../../application/features/whatsapp/domain';
import {
  EWhatsAppMessageDeliveryStatus,
  shouldAdvanceWhatsAppMessageStatus,
} from '../../../application/features/whatsapp/enums';
import { IWhatsAppMessagesRepository } from '../../../application/features/whatsapp/service/i-whatsapp-messages.repository';
import { WhatsAppMessagesFilterOptions } from '../../../application/features/whatsapp/options/whatsapp-messages-filter.options';
import { WhatsAppMessageEntity } from '../entities/whatsapp-message.entity';

@Injectable()
export class WhatsAppMessagesRepository implements IWhatsAppMessagesRepository {
  constructor(
    @InjectRepository(WhatsAppMessageEntity)
    private readonly repo: Repository<WhatsAppMessageEntity>,
  ) {}

  async createOutboundMessage(data: SaveWhatsAppOutboundMessageData): Promise<WhatsAppMessage> {
    const existing = await this.repo.findOne({ where: { metaMessageId: data.metaMessageId } });
    if (existing) {
      return this.map(existing);
    }

    const saved = await this.repo.save(
      this.repo.create({
        userId: data.userId,
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        metaMessageId: data.metaMessageId,
        recipient: data.recipient,
        messageType: data.messageType,
        templateName: data.templateName,
        contextType: data.contextType,
        contextId: data.contextId,
        contextLabel: data.contextLabel,
        deliveryStatus: data.deliveryStatus,
        statusTimestamp: data.statusTimestamp,
      }),
    );
    return this.map(saved);
  }

  async listByUserId(options: WhatsAppMessagesFilterOptions) {
    const { pageNumber, pageSize, skip } = getPaginationValues(options);
    const qb = this.repo.createQueryBuilder('m').where('m.user_id = :userId', { userId: options.userId });

    if (options.recipient?.trim()) {
      qb.andWhere('m.recipient LIKE :recipient', { recipient: `%${options.recipient.trim()}%` });
    }
    if (options.deliveryStatus) {
      qb.andWhere('m.delivery_status = :deliveryStatus', { deliveryStatus: options.deliveryStatus });
    }
    if (options.contextType) {
      qb.andWhere('m.context_type = :contextType', { contextType: options.contextType });
    }

    const [rows, totalCount] = await qb
      .orderBy('m.created_at', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    return toPaged(WhatsAppMessage, {
      items: rows.map((row) => this.map(row)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async findByMetaMessageId(metaMessageId: string): Promise<WhatsAppMessage | null> {
    const row = await this.repo.findOne({ where: { metaMessageId } });
    return row ? this.map(row) : null;
  }

  async findByUserIdAndMetaMessageId(userId: string, metaMessageId: string): Promise<WhatsAppMessage | null> {
    const row = await this.repo.findOne({ where: { userId, metaMessageId } });
    return row ? this.map(row) : null;
  }

  async applyStatusUpdate(
    metaMessageId: string,
    update: UpdateWhatsAppMessageStatusData,
  ): Promise<WhatsAppMessage | null> {
    const row = await this.repo.findOne({ where: { metaMessageId } });
    if (!row) {
      return null;
    }

    if (!shouldAdvanceWhatsAppMessageStatus(row.deliveryStatus, update.deliveryStatus)) {
      return this.map(row);
    }

    row.deliveryStatus = update.deliveryStatus;
    if (update.statusTimestamp) {
      row.statusTimestamp = update.statusTimestamp;
    }
    if (update.deliveryStatus === EWhatsAppMessageDeliveryStatus.Failed) {
      row.errorCode = update.errorCode;
      row.errorTitle = update.errorTitle;
      row.errorMessage = update.errorMessage;
    } else {
      row.errorCode = undefined;
      row.errorTitle = undefined;
      row.errorMessage = undefined;
    }

    const saved = await this.repo.save(row);
    return this.map(saved);
  }

  private map(row: WhatsAppMessageEntity): WhatsAppMessage {
    return plainToInstance(
      WhatsAppMessage,
      {
        id: row.id,
        userId: row.userId,
        wabaId: row.wabaId,
        phoneNumberId: row.phoneNumberId,
        metaMessageId: row.metaMessageId,
        recipient: row.recipient,
        messageType: row.messageType,
        templateName: row.templateName,
        contextType: row.contextType,
        contextId: row.contextId,
        contextLabel: row.contextLabel,
        deliveryStatus: row.deliveryStatus,
        statusTimestamp: row.statusTimestamp,
        errorCode: row.errorCode,
        errorTitle: row.errorTitle,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      { excludeExtraneousValues: true },
    );
  }
}
