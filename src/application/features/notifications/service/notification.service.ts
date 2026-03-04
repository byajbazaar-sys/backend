import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { Notification } from '../domain';
import { INotificationService } from './i-notification.service';
import { INotificationsRepository, NOTIFICATIONS_REPOSITORY } from '../repository';
import { IEmailService, EMAIL_SERVICE, SendEmail } from '../../../shared';
import { NotificationsFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { ENotificationChannel, ENotificationStatus } from '@shared-libs';
import { SendEmailRequestModel } from '../models';

@Injectable()
export class NotificationService implements INotificationService {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepo: INotificationsRepository,
    @Inject(EMAIL_SERVICE) private readonly emailService: IEmailService,
    @InjectPinoLogger(NotificationService.name) private readonly logger: PinoLogger,
  ) {}

  async sendEmail(data: SendEmailRequestModel, createdBy?: string): Promise<Notification> {
    this.logger.info({ to: data.to, subject: data.subject, createdBy }, 'Sending email');

    const notificationData = plainToInstance(Notification, {
      recipient: data.to,
      subject: data.subject,
      body: data.body,
      isHtml: data.isHtml ?? true,
      attachments: data.attachments,
      channel: ENotificationChannel.EMAIL,
      status: ENotificationStatus.PENDING,
      createdBy,
    }, { excludeExtraneousValues: true });

    const notification = await this.notificationsRepo.create(notificationData);

    try {
      const sendEmailData = plainToInstance(SendEmail, data, { excludeExtraneousValues: true });

      await this.emailService.sendEmail(sendEmailData);

      const updated = await this.notificationsRepo.update(notification.id, {
        status: ENotificationStatus.SENT,
      });
      return updated || notification;
    } catch (err) {
      this.logger.error({ err, to: data.to }, 'Email send failed');
      await this.notificationsRepo.update(notification.id, {
        status: ENotificationStatus.FAILED,
        errorMessage: err?.message || String(err),
      });
      const failedNotification = await this.notificationsRepo.findById(notification.id, createdBy);
      return failedNotification || notification;
    }
  }

  async getById(id: string, createdBy?: string): Promise<Notification> {
    const notification = await this.notificationsRepo.findById(id, createdBy);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async listNotifications(params: NotificationsFilterOptions): Promise<Paged<Notification>> {
    return this.notificationsRepo.listNotifications(params);
  }
}
