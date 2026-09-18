import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { Order } from '../../orders/domain';
import { EOrderStatus } from '../../orders/enums';
import { Customer } from '../../customers/domain';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { WHATSAPP_DEFAULT_TEMPLATES } from '../constants/whatsapp-default-template.constants';
import { EWhatsAppConnectionStatus, EWhatsAppMessageContextType } from '../enums';
import { normalizeWhatsAppRecipient } from '../utils/whatsapp-messaging.util';
import { IWhatsAppService, WHATSAPP_SERVICE } from './i-whatsapp.service';

export const WHATSAPP_ORDER_NOTIFICATION_SERVICE = 'WHATSAPP_ORDER_NOTIFICATION_SERVICE';

const ORDER_CREATED_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_order_created') ??
  WHATSAPP_DEFAULT_TEMPLATES[1];

const ORDER_UPDATE_TEMPLATE =
  WHATSAPP_DEFAULT_TEMPLATES.find((template) => template.name === 'byajbazaar_order_update') ??
  ORDER_CREATED_TEMPLATE;

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
    const rawPhone =
      customer.phone?.trim() ||
      customer.alternativePhone?.trim() ||
      order.customerPhone?.trim() ||
      '';
    const recipient = normalizeWhatsAppRecipient(rawPhone);
    if (!recipient || recipient.length < 11) {
      return { sent: false, channel: 'whatsapp', reason: 'Customer phone is missing or invalid' };
    }

    const connection = await this.whatsappService.getWhatsAppConnection(createdBy, createdBy);
    if (!connection || connection.connectionStatus === EWhatsAppConnectionStatus.Disconnected) {
      return {
        sent: false,
        channel: 'whatsapp',
        reason: 'WhatsApp is not connected. Connect WhatsApp Business in Account settings.',
      };
    }

    if (connection.canSendMessages === false) {
      return {
        sent: false,
        channel: 'whatsapp',
        reason:
          connection.messagingBlockReason?.trim() ||
          'WhatsApp messaging is blocked until your display name is approved in Meta WhatsApp Manager.',
      };
    }

    if (connection.hasPaymentMethod === false) {
      return {
        sent: false,
        channel: 'whatsapp',
        reason: 'Add a payment method in Meta WhatsApp Manager before sending WhatsApp messages.',
      };
    }

    try {
      await this.whatsappService.provisionWhatsAppDefaultTemplates(createdBy, createdBy);
    } catch (err) {
      this.logger.warn({ err, createdBy }, 'Could not auto-provision WhatsApp templates before order notify');
    }

    const user = await this.usersRepo.findById(createdBy);
    const businessName = user?.businessName?.trim() || 'Your jeweller';
    const statusLabel = STATUS_LABELS[order.status] ?? order.status;
    const dueDate = order.dueDate
      ? new Date(order.dueDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : 'TBD';
    const itemTitle = order.title?.trim() || 'Custom order';
    const orderNumber = order.orderNumber?.trim() || '—';

    const isNewOrder = order.status === EOrderStatus.NEW;
    const template = isNewOrder ? ORDER_CREATED_TEMPLATE : ORDER_UPDATE_TEMPLATE;
    const templateParams = isNewOrder
      ? [businessName, orderNumber, itemTitle, dueDate]
      : [businessName, orderNumber, itemTitle, statusLabel, dueDate];

    try {
      await this.whatsappService.sendTemplateMessage(
        createdBy,
        createdBy,
        recipient,
        template.name,
        template.language,
        templateParams.map((value) => value.trim() || '—'),
        {
          contextType: EWhatsAppMessageContextType.Order,
          contextId: order.id,
          contextLabel: `Order ${orderNumber !== '—' ? orderNumber : order.id} · ${statusLabel}`,
        },
      );

      const trimmedNote = note?.trim();
      if (trimmedNote) {
        try {
          await this.whatsappService.sendTextMessage(createdBy, createdBy, recipient, trimmedNote, {
            reengagementTemplateName: template.name,
            reengagementTemplateLanguage: template.language,
          });
        } catch (err) {
          this.logger.warn({ err, orderId: order.id }, 'Order template sent but follow-up note failed');
        }
      }

      this.logger.info({ orderId: order.id, recipient, createdBy }, 'Order WhatsApp notification sent');
      return { sent: true, channel: 'whatsapp', recipient };
    } catch (err) {
      const reason = this.extractFailureReason(err);
      this.logger.warn({ err, orderId: order.id, createdBy, reason }, 'Failed to send order WhatsApp notification');
      return { sent: false, channel: 'whatsapp', reason };
    }
  }

  private extractFailureReason(err: unknown): string {
    if (err instanceof BadRequestException) {
      const response = err.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        if (Array.isArray(message)) return message.join(', ');
        if (typeof message === 'string' && message.trim()) return message;
      }
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return 'WhatsApp delivery failed';
  }
}
