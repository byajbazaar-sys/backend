import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

import { CUSTOMERS_REPOSITORY, ICustomersRepository } from '../../customers/service';
import { DEPOSIT_SERVICE, IDepositService } from '../../deposits/service';
import { ETransactionPaidIn } from '../../transactions/enums/e-transaction-paid-in';
import {
  WHATSAPP_ORDER_NOTIFICATION_SERVICE,
  WhatsAppOrderNotificationService,
} from '../../whatsapp/service/whatsapp-order-notification.service';
import { CreateOrderData, Order, OrderActivity, OrderAttachment, UpdateOrderData } from '../domain';
import { EOrderActivityType, EOrderPriority, EOrderStatus } from '../enums';
import { AddOrderAdvanceData, NotifyOrderResponseModel, UpdateOrderPatch } from '../models';
import { OrdersFilterOptions } from '../options';
import { IOrdersService } from './i-orders.service';
import { getEffectiveOrderAmount, syncLegacyTotalAmount } from './order-amount.util';
import { ORDERS_REPOSITORY, IOrdersRepository } from './i-orders.repository';
import { OrderStats } from './order-stats';
import { isTerminalOrderStatus, isValidStatusTransition } from './order-status-transitions';
import {
  CACHE_NAMESPACE,
  CACHE_SERVICE,
  DASHBOARD_CACHE_TTL_SECONDS,
  ICacheService,
  IUsersFileStorage,
  queryCacheParts,
  USERS_FILE_STORAGE,
} from '../../../shared';

@Injectable()
export class OrdersService implements IOrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly ordersRepo: IOrdersRepository,
    @Inject(CUSTOMERS_REPOSITORY) private readonly customersRepo: ICustomersRepository,
    @Inject(DEPOSIT_SERVICE) private readonly depositService: IDepositService,
    @Inject(WHATSAPP_ORDER_NOTIFICATION_SERVICE)
    private readonly orderNotificationService: WhatsAppOrderNotificationService,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @InjectPinoLogger(OrdersService.name) private readonly logger: PinoLogger,
  ) {}

  async create(createdBy: string, data: CreateOrderData): Promise<Order> {
    const customer = await this.customersRepo.findById(data.customerId, createdBy);
    if (!customer) throw new NotFoundException('Customer not found');

    const orderNumber = await this.ordersRepo.getNextOrderNumber(createdBy);
    const estimatedAmount = this.normalizeAmount(
      data.estimatedAmount ?? data.totalAmount ?? 0,
      true,
    );
    const finalAmount =
      data.finalAmount != null ? this.normalizeAmount(data.finalAmount, true) : undefined;
    const order = await this.ordersRepo.create({
      orderNumber,
      customerId: data.customerId,
      createdBy,
      assignedTo: data.assignedTo,
      orderType: data.orderType,
      status: EOrderStatus.NEW,
      priority: data.priority ?? EOrderPriority.NORMAL,
      title: data.title,
      description: data.description,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      estimatedAmount,
      finalAmount,
      totalAmount: syncLegacyTotalAmount(estimatedAmount, finalAmount),
      paidAmount: 0,
      notes: data.notes,
    });

    await this.ordersRepo.addActivity({
      orderId: order.id,
      createdBy,
      activityType: EOrderActivityType.CREATED,
      message: `Order ${order.orderNumber} created`,
      toStatus: EOrderStatus.NEW,
    });

    this.logger.info({ orderId: order.id, createdBy }, 'Order created');
    await this.invalidateOrdersCache(createdBy);
    return this.enrichOrder(order, createdBy);
  }

  async findAll(options: OrdersFilterOptions) {
    return this.cache.getOrLoadVersioned(
      CACHE_NAMESPACE.ORDERS,
      options.createdBy,
      queryCacheParts('list', {
        page: options.page,
        limit: options.limit,
        status: options.status,
        orderType: options.orderType,
        customerId: options.customerId,
        assignedTo: options.assignedTo,
        dateFrom: options.dateFrom?.toISOString(),
        dateTo: options.dateTo?.toISOString(),
        overdue: options.overdue === undefined ? undefined : options.overdue ? 'true' : 'false',
        search: options.search,
        sortOrder: options.sortOrder,
        sortField: options.sortField,
      }),
      DASHBOARD_CACHE_TTL_SECONDS,
      () => this.ordersRepo.list(options),
    );
  }

  async findOne(id: string, createdBy: string): Promise<Order> {
    const order = await this.requireOrder(id, createdBy);
    return this.enrichOrder(order, createdBy);
  }

  async getStats(createdBy: string): Promise<OrderStats> {
    return this.cache.getOrLoadVersioned(
      CACHE_NAMESPACE.ORDERS,
      createdBy,
      ['stats'],
      DASHBOARD_CACHE_TTL_SECONDS,
      () => this.ordersRepo.getStats(createdBy),
    );
  }

  async update(id: string, createdBy: string, data: UpdateOrderData): Promise<Order> {
    const existing = await this.requireMutableOrder(id, createdBy);
    const patch: UpdateOrderPatch = {};
    const metadata: Record<string, unknown> = {};

    if (data.orderType !== undefined && data.orderType !== existing.orderType) {
      patch.orderType = data.orderType;
      metadata.orderType = { from: existing.orderType, to: data.orderType };
    }
    if (data.priority !== undefined && data.priority !== existing.priority) {
      patch.priority = data.priority;
      metadata.priority = { from: existing.priority, to: data.priority };
    }
    if (data.title !== undefined && data.title !== existing.title) {
      patch.title = data.title;
      metadata.title = { from: existing.title, to: data.title };
    }
    if (data.description !== undefined && data.description !== existing.description) {
      patch.description = data.description;
      metadata.description = { from: existing.description, to: data.description };
    }
    if (data.dueDate !== undefined) {
      const nextDueDate = data.dueDate ? new Date(data.dueDate) : null;
      const existingDueDate = existing.dueDate ? new Date(existing.dueDate).toISOString() : null;
      const nextDueDateIso = nextDueDate ? nextDueDate.toISOString() : null;
      if (existingDueDate !== nextDueDateIso) {
        patch.dueDate = nextDueDate ?? null;
        metadata.dueDate = { from: existingDueDate, to: nextDueDateIso };
      }
    }
    if (data.estimatedAmount !== undefined) {
      const estimatedAmount = this.normalizeAmount(data.estimatedAmount, true);
      if (estimatedAmount !== Number(existing.estimatedAmount)) {
        patch.estimatedAmount = estimatedAmount;
        patch.totalAmount = syncLegacyTotalAmount(estimatedAmount, existing.finalAmount);
        metadata.estimatedAmount = { from: existing.estimatedAmount, to: estimatedAmount };
      }
    }
    if (data.finalAmount !== undefined) {
      const finalAmount = data.finalAmount != null ? this.normalizeAmount(data.finalAmount, true) : null;
      const existingFinal = existing.finalAmount != null ? Number(existing.finalAmount) : null;
      if (finalAmount !== existingFinal) {
        patch.finalAmount = finalAmount;
        patch.totalAmount = syncLegacyTotalAmount(
          existing.estimatedAmount ?? 0,
          finalAmount,
        );
        metadata.finalAmount = { from: existingFinal, to: finalAmount };
      }
    }
    if (data.totalAmount !== undefined && data.estimatedAmount === undefined && data.finalAmount === undefined) {
      const estimatedAmount = this.normalizeAmount(data.totalAmount, true);
      if (estimatedAmount !== Number(existing.estimatedAmount)) {
        patch.estimatedAmount = estimatedAmount;
        patch.totalAmount = syncLegacyTotalAmount(estimatedAmount, existing.finalAmount);
        metadata.estimatedAmount = { from: existing.estimatedAmount, to: estimatedAmount };
      }
    }
    if (data.assignedTo !== undefined && data.assignedTo !== existing.assignedTo) {
      patch.assignedTo = data.assignedTo;
      metadata.assignedTo = { from: existing.assignedTo, to: data.assignedTo };
    }
    if (data.notes !== undefined && data.notes !== existing.notes) {
      patch.notes = data.notes;
      metadata.notes = { from: existing.notes, to: data.notes };
    }

    if (Object.keys(patch).length === 0) {
      return this.enrichOrder(existing, createdBy);
    }

    const nextEstimatedAmount = patch.estimatedAmount ?? Number(existing.estimatedAmount ?? 0);
    const nextFinalAmount =
      patch.finalAmount !== undefined
        ? patch.finalAmount
        : existing.finalAmount != null
          ? Number(existing.finalAmount)
          : null;
    this.assertPaidAmountWithinTotal(Number(existing.paidAmount), nextEstimatedAmount, nextFinalAmount);

    const updated = await this.ordersRepo.update(id, createdBy, patch);
    if (!updated) throw new NotFoundException('Order not found');

    await this.ordersRepo.addActivity({
      orderId: id,
      createdBy,
      activityType: EOrderActivityType.UPDATED,
      message: 'Order details updated',
      metadata,
    });

    this.logger.info({ orderId: id, createdBy }, 'Order updated');
    await this.invalidateOrdersCache(createdBy);
    return this.enrichOrder(updated, createdBy);
  }

  async updateStatus(id: string, createdBy: string, status: EOrderStatus, note?: string): Promise<Order> {
    const existing = await this.requireOrder(id, createdBy);
    if (existing.status === status) {
      return this.enrichOrder(existing, createdBy);
    }
    if (isTerminalOrderStatus(existing.status)) {
      throw new BadRequestException(`Order is already ${existing.status}`);
    }
    if (!isValidStatusTransition(existing.status, status)) {
      throw new BadRequestException(`Cannot transition from ${existing.status} to ${status}`);
    }

    const updated = await this.ordersRepo.update(id, createdBy, { status });
    if (!updated) throw new NotFoundException('Order not found');

    await this.ordersRepo.addActivity({
      orderId: id,
      createdBy,
      activityType: EOrderActivityType.STATUS_CHANGED,
      message: note ?? `Status changed from ${existing.status} to ${status}`,
      fromStatus: existing.status,
      toStatus: status,
    });

    this.logger.info({ orderId: id, from: existing.status, to: status, createdBy }, 'Order status updated');
    await this.invalidateOrdersCache(createdBy);
    return this.enrichOrder(updated, createdBy);
  }

  async addNote(id: string, createdBy: string, note: string, internal = false): Promise<OrderActivity> {
    const existing = await this.requireOrder(id, createdBy);
    if (isTerminalOrderStatus(existing.status)) {
      throw new BadRequestException(`Cannot add notes to a ${existing.status} order`);
    }

    const trimmed = note.trim();
    if (!trimmed) {
      throw new BadRequestException('Note cannot be empty');
    }

    const activity = await this.ordersRepo.addActivity({
      orderId: id,
      createdBy,
      activityType: EOrderActivityType.NOTE_ADDED,
      message: internal ? `[Internal] ${trimmed}` : trimmed,
      metadata: internal ? { internal: true } : undefined,
    });

    this.logger.info({ orderId: id, createdBy }, 'Order note added');
    await this.invalidateOrdersCache(createdBy);
    return activity;
  }

  async addAdvance(id: string, createdBy: string, data: AddOrderAdvanceData): Promise<Order> {
    const existing = await this.requireMutableOrder(id, createdBy);
    const normalizedAmount = this.normalizeAmount(data.amount);
    const nextPaidAmount = Number(existing.paidAmount) + normalizedAmount;

    const effectiveAmount = getEffectiveOrderAmount(existing);
    if (effectiveAmount > 0 && nextPaidAmount > effectiveAmount) {
      throw new BadRequestException('Advance amount exceeds order total');
    }

    const depositAccount = await this.depositService.findOrCreateActiveAccount(
      existing.customerId,
      createdBy,
    );

    const paymentMode = data.paymentMode ?? ETransactionPaidIn.CASH;
    const depositRemarks =
      data.note?.trim() ||
      `Order ${existing.orderNumber} advance`;

    const updated = await this.ordersRepo.update(id, createdBy, { paidAmount: nextPaidAmount });
    if (!updated) throw new NotFoundException('Order not found');

    try {
      await this.depositService.addDeposit(depositAccount.id, createdBy, {
        amount: normalizedAmount,
        paymentMode,
        transactionReference: data.transactionReference ?? existing.orderNumber,
        remarks: depositRemarks,
        orderId: id,
      });
    } catch (err) {
      await this.ordersRepo.update(id, createdBy, { paidAmount: Number(existing.paidAmount) });
      throw err;
    }

    await this.ordersRepo.addActivity({
      orderId: id,
      createdBy,
      activityType: EOrderActivityType.ADVANCE_PAYMENT,
      message: data.note?.trim() ?? `Advance payment of ${normalizedAmount} recorded`,
      amount: normalizedAmount,
      metadata: {
        paidAmount: { from: existing.paidAmount, to: nextPaidAmount },
        depositAccountId: depositAccount.id,
        depositNumber: depositAccount.depositNumber,
        paymentMode,
        transactionReference: data.transactionReference ?? existing.orderNumber,
      },
    });

    this.logger.info(
      { orderId: id, amount: normalizedAmount, depositAccountId: depositAccount.id, createdBy },
      'Order advance recorded and linked to deposit account',
    );
    await this.invalidateOrdersCache(createdBy);
    return this.enrichOrder(updated, createdBy);
  }

  async cancel(id: string, createdBy: string): Promise<Order> {
    const existing = await this.requireOrder(id, createdBy);
    if (existing.status === EOrderStatus.CANCELLED) {
      return this.enrichOrder(existing, createdBy);
    }
    if (existing.status === EOrderStatus.COMPLETED) {
      throw new BadRequestException('Completed orders cannot be cancelled');
    }

    const updated = await this.ordersRepo.update(id, createdBy, { status: EOrderStatus.CANCELLED });
    if (!updated) throw new NotFoundException('Order not found');

    await this.ordersRepo.addActivity({
      orderId: id,
      createdBy,
      activityType: EOrderActivityType.CANCELLED,
      message: 'Order cancelled',
      fromStatus: existing.status,
      toStatus: EOrderStatus.CANCELLED,
    });

    this.logger.info({ orderId: id, createdBy }, 'Order cancelled');
    await this.invalidateOrdersCache(createdBy);
    return this.enrichOrder(updated, createdBy);
  }

  async getActivity(id: string, createdBy: string): Promise<OrderActivity[]> {
    await this.requireOrder(id, createdBy);
    return this.ordersRepo.getActivities(id, createdBy);
  }

  async addAttachment(id: string, createdBy: string, file?: Express.Multer.File): Promise<Order> {
    await this.requireMutableOrder(id, createdBy);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Attachment file is required');
    }

    const prepared = await this.prepareAttachment(file);
    const attachmentId = uuidv4();
    const storageKey = `orders/${createdBy}/${id}/${attachmentId}.${prepared.fileExtension}`;
    await this.fileStorage.writeAsync(storageKey, prepared.buffer, prepared.mimetype);

    let attachment: OrderAttachment;
    try {
      attachment = await this.ordersRepo.addAttachment({
        orderId: id,
        createdBy,
        storageKey,
        filename: file.originalname,
        mimeType: prepared.mimetype,
      });
    } catch (err) {
      try {
        await this.fileStorage.removeAsync(storageKey);
      } catch (removeErr) {
        this.logger.warn({ err: removeErr, storageKey }, 'Failed to rollback orphan attachment upload');
      }
      throw err;
    }

    try {
      await this.ordersRepo.addActivity({
        orderId: id,
        createdBy,
        activityType: EOrderActivityType.ATTACHMENT_ADDED,
        message: `Attachment added: ${file.originalname || attachment.id}`,
        metadata: { attachmentId: attachment.id, filename: file.originalname },
      });
    } catch (err) {
      this.logger.warn({ err, orderId: id, attachmentId: attachment.id }, 'Failed to log attachment activity');
    }

    await this.invalidateOrdersCache(createdBy);
    return this.enrichOrder(await this.requireOrder(id, createdBy), createdBy);
  }

  async removeAttachment(id: string, attachmentId: string, createdBy: string): Promise<Order> {
    await this.requireMutableOrder(id, createdBy);
    const removed = await this.ordersRepo.deleteAttachment(attachmentId, id, createdBy);
    if (!removed) throw new NotFoundException('Attachment not found');

    if (removed.storageKey) {
      try {
        await this.fileStorage.removeAsync(removed.storageKey);
      } catch (err) {
        this.logger.warn({ err, storageKey: removed.storageKey }, 'Failed to delete order attachment file');
      }
    }

    try {
      await this.ordersRepo.addActivity({
        orderId: id,
        createdBy,
        activityType: EOrderActivityType.ATTACHMENT_REMOVED,
        message: `Attachment removed: ${removed.filename ?? attachmentId}`,
        metadata: { attachmentId },
      });
    } catch (err) {
      this.logger.warn({ err, orderId: id, attachmentId }, 'Failed to log attachment removal activity');
    }

    await this.invalidateOrdersCache(createdBy);
    return this.enrichOrder(await this.requireOrder(id, createdBy), createdBy);
  }

  async notifyCustomer(id: string, createdBy: string, note?: string): Promise<NotifyOrderResponseModel> {
    const order = await this.requireOrder(id, createdBy);
    const customer = await this.customersRepo.findById(order.customerId, createdBy);
    if (!customer) throw new NotFoundException('Customer not found');

    const result = await this.orderNotificationService.notifyCustomer(createdBy, order, customer, note);
    if (result.sent) {
      try {
        await this.ordersRepo.addActivity({
          orderId: id,
          createdBy,
          activityType: EOrderActivityType.CUSTOMER_NOTIFIED,
          message: note?.trim() || 'Customer notified via WhatsApp',
          metadata: { channel: result.channel, recipient: result.recipient },
        });
        await this.invalidateOrdersCache(createdBy);
      } catch (err) {
        this.logger.warn({ err, orderId: id }, 'Customer notified but activity logging failed');
      }
    }

    return result;
  }

  private async enrichOrder(order: Order, createdBy: string): Promise<Order> {
    const attachments = await this.ordersRepo.getAttachments(order.id, createdBy);
    const enrichedAttachments = await Promise.all(
      attachments.map(async (attachment) => this.enrichAttachment(attachment)),
    );
    return { ...order, attachments: enrichedAttachments };
  }

  private async enrichAttachment(attachment: OrderAttachment): Promise<OrderAttachment> {
    if (!attachment.storageKey) return attachment;
    const url = await this.fileStorage.getUrlAsync(attachment.storageKey);
    return { ...attachment, url: url ?? undefined };
  }

  private async prepareAttachment(file: Express.Multer.File): Promise<{
    buffer: Buffer;
    mimetype: string;
    fileExtension: string;
  }> {
    if (file.mimetype === 'application/pdf') {
      return { buffer: file.buffer, mimetype: file.mimetype, fileExtension: 'pdf' };
    }
    const normalized = await normalizeImageBufferForStorageOrThrow(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    return {
      buffer: normalized.buffer,
      mimetype: normalized.mimetype,
      fileExtension: normalized.fileExtension,
    };
  }

  private async requireOrder(id: string, createdBy: string): Promise<Order> {
    const order = await this.ordersRepo.findById(id, createdBy);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async requireMutableOrder(id: string, createdBy: string): Promise<Order> {
    const order = await this.requireOrder(id, createdBy);
    if (isTerminalOrderStatus(order.status)) {
      throw new BadRequestException(`Order is ${order.status} and cannot be modified`);
    }
    return order;
  }

  private assertPaidAmountWithinTotal(
    paidAmount: number,
    estimatedAmount: number,
    finalAmount?: number | null,
  ): void {
    const effectiveAmount = getEffectiveOrderAmount({ estimatedAmount, finalAmount });
    if (effectiveAmount > 0 && paidAmount > effectiveAmount) {
      throw new BadRequestException('Order amount cannot be less than amount already paid');
    }
  }

  private normalizeAmount(amount: number, allowZero = false): number {
    const value = Number(amount);
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
      throw new BadRequestException(allowZero ? 'Amount must be zero or greater' : 'Amount must be greater than zero');
    }
    return Math.round(value * 100) / 100;
  }

  private async invalidateOrdersCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.ORDERS, userId);
  }
}
