import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { Order } from '../../orders/domain';
import { EOrderStatus } from '../../orders/enums';
import { Customer } from '../../customers/domain';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { WHATSAPP_DEFAULT_TEMPLATES } from '../constants/whatsapp-default-template.constants';
import { normalizeWhatsAppRecipient } from '../utils/whatsapp-messaging.util';
import { IWhatsAppService, WHATSAPP_SERVICE } from './i-whatsapp.service';

export const WHATSAPP_ORDER_NOTIFICATION_SERVICE = 'WHATSAPP_ORDER_NOTIFICATION_SERVICE';

const ORDER_UPDATE_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_order_update') ??
  WHATSAPP_DEFAULT_TEMPLATES[1];

const STATUS_LABELS: Record<EOrderStatus, string> = {
  [EOrderStatus.NEW]: 'New',
  [EOrderStatus.CONFIRMED]: 'Confirmed',
  [EOrderStatus.IN_PROGRESS]: 'In Progress',
  [EOrderStatus.READY]: 'Ready',
  [EOrderStatus.DELIVERED]: 'Delivered',
  [EOrderStatus.COMPLETED]: 'Completed',
  [EOrderStatus.ON_HOLD]: 'On Hold',
  [EOrderStatus.CANCELLED]: 'Cancelled',
};

export interface OrderNotificationResult {
  sent: boolean;
  channel: 'whatsapp';
  recipient?: string;
  reason?: string;
}

@Injectable()
export class WhatsAppOrderNotificationService {
  constructor(
    @Inject(WHATSAPP_SERVICE) private readonly whatsappService: IWhatsAppService,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @InjectPinoLogger(WhatsAppOrderNotificationService.name) private readonly logger: PinoLogger,
  ) {}

  async notifyCustomer(
    createdBy: string,
    order: Order,
    customer: Customer,
    note?: string,
  ): Promise<OrderNotificationResult> {
    const phone = customer.phone || customer.alternativePhone;
    const recipient = normalizeWhatsAppRecipient(phone);
    if (!recipient || recipient.length < 11) {
      return { sent: false, channel: 'whatsapp', reason: 'Customer phone is missing or invalid' };
    }

    const user = await this.usersRepo.findById(createdBy);
    const businessName = user?.businessName?.trim() || 'Your jeweller';
    const statusLabel = STATUS_LABELS[order.status] ?? order.status;
    const dueDate = order.dueDate
      ? new Date(order.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'TBD';
    const itemTitle = order.title?.trim() || 'Custom order';

    try {
      await this.whatsappService.sendTemplateMessage(
        createdBy,
        createdBy,
        recipient,
        ORDER_UPDATE_TEMPLATE.name,
        ORDER_UPDATE_TEMPLATE.language,
        [businessName, order.orderNumber ?? '', itemTitle, statusLabel, dueDate],
      );

      if (note?.trim()) {
        try {
          await this.whatsappService.sendTextMessage(createdBy, createdBy, recipient, note.trim());
        } catch (err) {
          this.logger.warn({ err, orderId: order.id }, 'Order template sent but follow-up note failed');
        }
      }

      this.logger.info({ orderId: order.id, recipient, createdBy }, 'Order WhatsApp notification sent');
      return { sent: true, channel: 'whatsapp', recipient };
    } catch (err) {
      this.logger.warn({ err, orderId: order.id, createdBy }, 'Failed to send order WhatsApp notification');
      return { sent: false, channel: 'whatsapp', reason: 'WhatsApp delivery failed' };
    }
  }
}
