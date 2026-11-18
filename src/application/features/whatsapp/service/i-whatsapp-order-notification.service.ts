import type { Customer } from '../../customers';
import type { Order } from '../../orders';
import { OrderNotificationResult } from '../domain';

export const WHATSAPP_ORDER_NOTIFICATION_SERVICE = 'WHATSAPP_ORDER_NOTIFICATION_SERVICE';

export interface IWhatsAppOrderNotificationService {
  notifyCustomer(createdBy: string, order: Order, customer: Customer, note?: string): Promise<OrderNotificationResult>;
}
