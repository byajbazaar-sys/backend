import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ESortOrder, getPaginationValues, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import { Order, OrderActivity, OrderAttachment } from '../../../application/features/orders/domain';
import { EOrderStatus } from '../../../application/features/orders/enums';
import { CreateOrderActivityInput, CreateOrderInput, UpdateOrderPatch } from '../../../application/features/orders/models';
import { OrdersFilterOptions } from '../../../application/features/orders/options';
import { IOrdersRepository } from '../../../application/features/orders/service/i-orders.repository';
import { OrderStats } from '../../../application/features/orders/service/order-stats';
import { isOrderOverdue } from '../../../application/features/orders/service/order-status-transitions';
import { OrderActivityEntity } from '../entities/order-activity.entity';
import { OrderAttachmentEntity } from '../entities/order-attachment.entity';
import { OrderEntity } from '../entities/order.entity';

@Injectable()
export class OrdersRepository implements IOrdersRepository {
  constructor(
    @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(OrderActivityEntity) private readonly activityRepo: Repository<OrderActivityEntity>,
    @InjectRepository(OrderAttachmentEntity) private readonly attachmentRepo: Repository<OrderAttachmentEntity>,
  ) {}

  async getNextOrderNumber(createdBy: string): Promise<string> {
    const prefix = 'BZ-';
    const last = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.createdBy = :createdBy', { createdBy })
      .andWhere('o.orderNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('o.orderNumber', 'DESC')
      .getOne();
    const lastSeq = last ? Number(last.orderNumber.replace(prefix, '')) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
  }

  async list(options: OrdersFilterOptions) {
    const { pageNumber, pageSize, skip } = getPaginationValues({
      pageNumber: options.page,
      pageSize: options.limit,
    });
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoin('o.customer', 'customer')
      .leftJoin('o.assignee', 'assignee')
      .addSelect(['customer.firstName', 'customer.lastName', 'customer.phone'])
      .addSelect(['assignee.firstName', 'assignee.lastName'])
      .where('o.createdBy = :createdBy', { createdBy: options.createdBy });

    if (options.status) qb.andWhere('o.status = :status', { status: options.status });
    if (options.orderType) qb.andWhere('o.orderType = :orderType', { orderType: options.orderType });
    if (options.customerId) qb.andWhere('o.customerId = :customerId', { customerId: options.customerId });
    if (options.assignedTo) qb.andWhere('o.assignedTo = :assignedTo', { assignedTo: options.assignedTo });
    if (options.dateFrom) qb.andWhere('o.createdAt >= :dateFrom', { dateFrom: options.dateFrom });
    if (options.dateTo) qb.andWhere('o.createdAt <= :dateTo', { dateTo: options.dateTo });
    if (options.overdue === true) {
      qb.andWhere('o.dueDate IS NOT NULL')
        .andWhere('o.dueDate < :now', { now: new Date() })
        .andWhere('o.status NOT IN (:...terminalStatuses)', {
          terminalStatuses: [EOrderStatus.COMPLETED, EOrderStatus.CANCELLED, EOrderStatus.DELIVERED],
        });
    }
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(o.orderNumber ILIKE :q OR o.title ILIKE :q OR o.description ILIKE :q OR customer.firstName ILIKE :q OR customer.lastName ILIKE :q OR customer.phone ILIKE :q)',
        { q },
      );
    }

    const sortFieldMap: Record<string, string> = {
      createdAt: 'o.createdAt',
      dueDate: 'o.dueDate',
      totalAmount: 'o.totalAmount',
      priority: 'o.priority',
      status: 'o.status',
      orderNumber: 'o.orderNumber',
    };
    const sortField = sortFieldMap[options.sortField ?? 'createdAt'] ?? 'o.createdAt';
    const sortOrder = options.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    qb.orderBy(sortField, sortOrder);

    const [rows, totalCount] = await qb.skip(skip).take(pageSize).getManyAndCount();
    const items = rows.map((row) => this.mapOrder(row));
    return toPaged(Order, { items, page: pageNumber, perPage: pageSize, totalCount });
  }

  async findById(id: string, createdBy: string): Promise<Order> {
    const row = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoin('o.customer', 'customer')
      .leftJoin('o.assignee', 'assignee')
      .addSelect(['customer.firstName', 'customer.lastName', 'customer.phone'])
      .addSelect(['assignee.firstName', 'assignee.lastName'])
      .where('o.id = :id', { id })
      .andWhere('o.createdBy = :createdBy', { createdBy })
      .getOne();
    if (!row) return null;
    return this.mapOrder(row);
  }

  async create(order: CreateOrderInput): Promise<Order> {
    const entity = this.orderRepo.create(order);
    const saved = await this.orderRepo.save(entity);
    return this.findById(saved.id, order.createdBy);
  }

  async update(id: string, createdBy: string, data: UpdateOrderPatch): Promise<Order> {
    const existing = await this.orderRepo.findOne({ where: { id, createdBy } });
    if (!existing) return null;
    Object.assign(existing, data);
    await this.orderRepo.save(existing);
    return this.findById(id, createdBy);
  }

  async addActivity(activity: CreateOrderActivityInput): Promise<OrderActivity> {
    const entity = this.activityRepo.create(activity);
    const saved = await this.activityRepo.save(entity);
    return this.mapActivity(saved);
  }

  async getActivities(orderId: string, createdBy: string): Promise<OrderActivity[]> {
    const rows = await this.activityRepo
      .createQueryBuilder('a')
      .innerJoin('a.order', 'o')
      .leftJoin('a.user', 'user')
      .addSelect(['user.firstName', 'user.lastName'])
      .where('a.orderId = :orderId', { orderId })
      .andWhere('o.createdBy = :createdBy', { createdBy })
      .orderBy('a.createdAt', 'ASC')
      .getMany();
    return rows.map((row) => this.mapActivity(row));
  }

  async getStats(createdBy: string): Promise<OrderStats> {
    const now = new Date();
    const raw = await this.orderRepo
      .createQueryBuilder('o')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN o.status = '${EOrderStatus.NEW}' THEN 1 ELSE 0 END)`, 'new')
      .addSelect(`SUM(CASE WHEN o.status = '${EOrderStatus.IN_PROGRESS}' THEN 1 ELSE 0 END)`, 'inProgress')
      .addSelect(`SUM(CASE WHEN o.status = '${EOrderStatus.READY}' THEN 1 ELSE 0 END)`, 'ready')
      .addSelect(`SUM(CASE WHEN o.status = '${EOrderStatus.COMPLETED}' THEN 1 ELSE 0 END)`, 'completed')
      .addSelect(
        `SUM(CASE WHEN o.dueDate IS NOT NULL AND o.dueDate < :now AND o.status NOT IN ('${EOrderStatus.COMPLETED}', '${EOrderStatus.CANCELLED}', '${EOrderStatus.DELIVERED}') THEN 1 ELSE 0 END)`,
        'overdue',
      )
      .where('o.createdBy = :createdBy', { createdBy })
      .setParameter('now', now)
      .getRawOne();

    return {
      total: Number(raw?.total ?? 0),
      new: Number(raw?.new ?? 0),
      inProgress: Number(raw?.inProgress ?? 0),
      ready: Number(raw?.ready ?? 0),
      overdue: Number(raw?.overdue ?? 0),
      completed: Number(raw?.completed ?? 0),
    };
  }

  async getAttachments(orderId: string, createdBy: string): Promise<OrderAttachment[]> {
    const rows = await this.attachmentRepo
      .createQueryBuilder('a')
      .innerJoin('a.order', 'o')
      .where('a.orderId = :orderId', { orderId })
      .andWhere('o.createdBy = :createdBy', { createdBy })
      .orderBy('a.createdAt', 'ASC')
      .getMany();
    return rows.map((row) => this.mapAttachment(row));
  }

  async addAttachment(attachment: {
    orderId: string;
    createdBy: string;
    storageKey: string;
    filename?: string;
    mimeType?: string;
  }): Promise<OrderAttachment> {
    const entity = this.attachmentRepo.create(attachment);
    const saved = await this.attachmentRepo.save(entity);
    return this.mapAttachment(saved);
  }

  async deleteAttachment(id: string, orderId: string, createdBy: string): Promise<OrderAttachment | null> {
    const row = await this.attachmentRepo
      .createQueryBuilder('a')
      .innerJoin('a.order', 'o')
      .where('a.id = :id', { id })
      .andWhere('a.orderId = :orderId', { orderId })
      .andWhere('o.createdBy = :createdBy', { createdBy })
      .getOne();
    if (!row) return null;
    const mapped = this.mapAttachment(row);
    await this.attachmentRepo.delete(id);
    return mapped;
  }

  private mapAttachment(entity: OrderAttachmentEntity): OrderAttachment {
    return plainToInstance(
      OrderAttachment,
      {
        id: entity.id,
        orderId: entity.orderId,
        storageKey: entity.storageKey,
        filename: entity.filename,
        mimeType: entity.mimeType,
        createdAt: entity.createdAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapOrder(entity: OrderEntity): Order {
    const customer = (
      entity as OrderEntity & { customer?: { firstName?: string; lastName?: string; phone?: string } }
    ).customer;
    const assignee = (entity as OrderEntity & { assignee?: { firstName?: string; lastName?: string } }).assignee;
    const estimatedAmount = Number(entity.estimatedAmount ?? entity.totalAmount ?? 0);
    const finalAmount = entity.finalAmount != null ? Number(entity.finalAmount) : undefined;
    return plainToInstance(
      Order,
      {
        ...entity,
        estimatedAmount,
        finalAmount,
        totalAmount: finalAmount ?? estimatedAmount,
        paidAmount: Number(entity.paidAmount),
        customerFirstName: customer?.firstName,
        customerLastName: customer?.lastName,
        customerPhone: customer?.phone,
        assignedToFirstName: assignee?.firstName,
        assignedToLastName: assignee?.lastName,
        isOverdue: isOrderOverdue(entity.status, entity.dueDate),
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapActivity(entity: OrderActivityEntity): OrderActivity {
    const user = (entity as OrderActivityEntity & { user?: { firstName?: string; lastName?: string } }).user;
    return plainToInstance(
      OrderActivity,
      {
        ...entity,
        amount: entity.amount != null ? Number(entity.amount) : undefined,
        createdByFirstName: user?.firstName,
        createdByLastName: user?.lastName,
      },
      { excludeExtraneousValues: true },
    );
  }
}
