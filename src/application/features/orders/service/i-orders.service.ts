import { Paged } from '@shared-libs';

import { CreateOrderData, Order, OrderActivity, UpdateOrderData } from '../domain';
import { AddOrderAdvanceData } from '../models/add-order-advance-data.model';
import { NotifyOrderResponseModel } from '../models/notify-order-response.model';
import { OrdersFilterOptions } from '../options';
import { OrderStats } from './order-stats';
import { EOrderStatus } from '../enums';

export const ORDER_SERVICE = 'ORDER_SERVICE';

export interface IOrdersService {
  create(createdBy: string, data: CreateOrderData, image?: Express.Multer.File): Promise<Order>;
  findAll(options: OrdersFilterOptions): Promise<Paged<Order>>;
  findOne(id: string, createdBy: string): Promise<Order>;
  getStats(createdBy: string): Promise<OrderStats>;
  update(id: string, createdBy: string, data: UpdateOrderData): Promise<Order>;
  updateStatus(id: string, createdBy: string, status: EOrderStatus, note?: string): Promise<Order>;
  addNote(id: string, createdBy: string, note: string, internal?: boolean): Promise<OrderActivity>;
  addAdvance(id: string, createdBy: string, data: AddOrderAdvanceData): Promise<Order>;
  cancel(id: string, createdBy: string): Promise<Order>;
  getActivity(id: string, createdBy: string): Promise<OrderActivity[]>;
  addAttachment(id: string, createdBy: string, file?: Express.Multer.File): Promise<Order>;
  removeAttachment(id: string, attachmentId: string, createdBy: string): Promise<Order>;
  notifyCustomer(id: string, createdBy: string, note?: string): Promise<NotifyOrderResponseModel>;
}
