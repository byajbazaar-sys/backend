import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../entities/notification.entity';
import { plainToInstance } from 'class-transformer';
import {
  INotificationsRepository,
  Notification,
  NotificationsFilterOptions,
} from '../../../application/features/notifications';
import { ENotificationChannel, ENotificationStatus, ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';

@Injectable()
export class NotificationsRepository implements INotificationsRepository {
  constructor(
    @InjectRepository(NotificationEntity) private readonly notificationRepo: Repository<NotificationEntity>,
  ) {}

  async create(notification: Notification): Promise<Notification> {
    const entity = this.notificationRepo.create({
      channel: notification.channel as ENotificationChannel,
      recipient: notification.recipient,
      subject: notification.subject,
      body: notification.body,
      status: notification.status as ENotificationStatus,
      externalId: notification.externalId,
      metadata: notification.metadata,
      errorMessage: notification.errorMessage,
      createdById: notification.createdBy ?? null,
    });
    const created = await this.notificationRepo.save(entity);
    return plainToInstance(Notification, created, { excludeExtraneousValues: true });
  }

  async update(id: string, notification: Partial<Notification>): Promise<Notification | null> {
    const updateData: Partial<NotificationEntity> = {};
    if (notification.status !== undefined) updateData.status = notification.status as ENotificationStatus;
    if (notification.externalId !== undefined) updateData.externalId = notification.externalId;
    if (notification.errorMessage !== undefined) updateData.errorMessage = notification.errorMessage;

    await this.notificationRepo.update(id, updateData);
    const updated = await this.notificationRepo.findOne({ where: { id } });
    if (!updated) return null;
    return plainToInstance(Notification, updated, { excludeExtraneousValues: true });
  }

  async findById(id: string, createdBy?: string): Promise<Notification | null> {
    const where: { id: string; createdById?: string } = { id };
    if (createdBy) where.createdById = createdBy;

    const doc = await this.notificationRepo.findOne({ where });
    if (!doc) return null;
    return plainToInstance(Notification, doc, { excludeExtraneousValues: true });
  }

  async listNotifications(params: NotificationsFilterOptions): Promise<Paged<Notification>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'createdAt';

    const qb = this.notificationRepo.createQueryBuilder('n');

    if (params.channel) qb.andWhere('n.channel = :channel', { channel: params.channel });
    if (params.status) qb.andWhere('n.status = :status', { status: params.status });
    if (params.recipient) qb.andWhere('n.recipient ILIKE :recipient', { recipient: `%${params.recipient}%` });
    if (params.createdBy) qb.andWhere('n.created_by_id = :createdBy', { createdBy: params.createdBy });

    const [docs, totalCount] = await qb
      .orderBy(`n.${sortField}`, sortOrder)
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    return toPaged(Notification, {
      items: docs,
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }
}
