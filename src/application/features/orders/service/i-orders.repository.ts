import { Paged } from '@shared-libs';

import { Order, OrderActivity, OrderAttachment } from '../domain';
import { CreateOrderActivityInput, CreateOrderInput, UpdateOrderPatch } from '../models';
import { OrdersFilterOptions } from '../options';
import { OrderStats } from './order-stats';

export const ORDERS_REPOSITORY = 'ORDERS_REPOSITORY';

export interface IOrdersRepository {
  getNextOrderNumber(createdBy: string): Promise<string>;
  list(options: OrdersFilterOptions): Promise<Paged<Order>>;
  findById(id: string, createdBy: string): Promise<Order>;
  create(order: CreateOrderInput): Promise<Order>;
  update(id: string, createdBy: string, data: UpdateOrderPatch): Promise<Order>;
  addActivity(activity: CreateOrderActivityInput): Promise<OrderActivity>;
  getActivities(orderId: string, createdBy: string): Promise<OrderActivity[]>;
  getStats(createdBy: string): Promise<OrderStats>;
  getAttachments(orderId: string, createdBy: string): Promise<OrderAttachment[]>;
  addAttachment(attachment: {
    orderId: string;
    createdBy: string;
    storageKey: string;
    filename?: string;
    mimeType?: string;
  }): Promise<OrderAttachment>;
  deleteAttachment(id: string, orderId: string, createdBy: string): Promise<OrderAttachment | null>;
}
