import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import {
  INotificationsRepository,
  Notification,
  NotificationsFilterOptions,
} from '../../../application/features/notifications';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';
import { NotificationsSchema, NotificationDocument } from '../schemas';

@Injectable()
export class NotificationsRepository implements INotificationsRepository {
  constructor(
    @InjectModel(NotificationsSchema.name) private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(notification: Notification): Promise<Notification> {
    try {
      const normalized = plainToInstance(Notification, notification, { excludeExtraneousValues: true });

      const doc = await this.notificationModel.create({
        channel: normalized.channel,
        recipient: normalized.recipient,
        subject: normalized.subject,
        body: normalized.body,
        status: normalized.status,
        externalId: normalized.externalId,
        metadata: normalized.metadata,
        errorMessage: normalized.errorMessage,
        createdBy: normalized.createdBy ? new Types.ObjectId(normalized.createdBy) : undefined,
      });

      return plainToInstance(Notification, doc.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async update(id: string, notification: Partial<Notification>): Promise<Notification | null> {
    try {
      const updateData: Record<string, unknown> = {};
      if (notification.status !== undefined) updateData.status = notification.status;
      if (notification.externalId !== undefined) updateData.externalId = notification.externalId;
      if (notification.errorMessage !== undefined) updateData.errorMessage = notification.errorMessage;

      const doc = await this.notificationModel
        .findByIdAndUpdate(new Types.ObjectId(id), updateData, { new: true })
        .lean()
        .exec();

      if (!doc) return null;

      return plainToInstance(Notification, doc, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findById(id: string, createdBy?: string): Promise<Notification | null> {
    try {
      const filter: Record<string, unknown> = { _id: new Types.ObjectId(id) };
      if (createdBy) {
        filter.createdBy = new Types.ObjectId(createdBy);
      }

      const doc = await this.notificationModel.findOne(filter).lean().exec();
      if (!doc) return null;

      return plainToInstance(Notification, doc, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async listNotifications(params: NotificationsFilterOptions): Promise<Paged<Notification>> {
    try {
      const filter: Record<string, unknown> = {};
      if (params.channel) filter.channel = params.channel;
      if (params.status) filter.status = params.status;
      if (params.recipient) filter.recipient = { $regex: params.recipient, $options: 'i' };
      if (params.createdBy) filter.createdBy = new Types.ObjectId(params.createdBy);

      const { pageNumber, pageSize, skip } = getPaginationValues(params);
      const sortOrder = params.sortOrder === ESortOrder.ASC ? 1 : -1;
      const sortField = params.sortField || 'createdAt';

      const [docs, totalCount] = await Promise.all([
        this.notificationModel
          .find(filter)
          .sort({ [sortField]: sortOrder })
          .skip(skip)
          .limit(pageSize)
          .lean()
          .exec(),
        this.notificationModel.countDocuments(filter),
      ]);

      return toPaged(Notification, {
        items: docs,
        page: pageNumber,
        perPage: pageSize,
        totalCount,
      });
    } catch (err) {
      throw err;
    }
  }
}
