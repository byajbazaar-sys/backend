import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { In, Repository } from 'typeorm';

import { Due, DuesFilterOptions, IDuesRepository, EDueType, WhatsAppDueReminderCandidate } from '../../../application';
import { EWhatsAppConnectionStatus } from '../../../application/features/whatsapp/enums';
import { UpdateDueEntityInput } from '../../../application/features/transactions/models/update-due-entity-input.model';
import { DueEntity } from '../entities/due.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionalContext } from '../transactional-context';

@Injectable()
export class DuesRepository implements IDuesRepository {
  constructor(@InjectRepository(DueEntity) private readonly defaultDueRepo: Repository<DueEntity>) {}

  private get dueRepo(): Repository<DueEntity> {
    return TransactionalContext.repositoryFor(DueEntity, this.defaultDueRepo);
  }

  async listDues(params: DuesFilterOptions): Promise<Paged<Due>> {
    const { loanIds, createdBy, type, customerName } = params;
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'dueDate';

    const qb = this.dueRepo.createQueryBuilder('d').leftJoinAndSelect('d.customer', 'customer');

    if (loanIds?.length) qb.andWhere('d.loanId IN (:...loanIds)', { loanIds });
    if (createdBy) qb.andWhere('d.created_by = :createdBy', { createdBy });
    if (type?.length) qb.andWhere('d.type IN (:...type)', { type });
    if (customerName) {
      qb.andWhere('(customer.first_name ILIKE :name OR customer.last_name ILIKE :name)', { name: `%${customerName}%` });
    }

    qb.orderBy(`d.${sortField}`, sortOrder).skip(skip).take(pageSize);

    const [items, totalCount] = await qb.getManyAndCount();

    const txRepo = this.dueRepo.manager.getRepository(TransactionEntity);
    const customerIds = [...new Set(items.map((d) => d.customerId))];
    const latestTxs = customerIds.length
      ? await txRepo
          .createQueryBuilder('t')
          .where('t.customerId IN (:...customerIds)', { customerIds })
          .orderBy('t.createdAt', 'DESC')
          .getMany()
      : [];
    const latestByCustomer = new Map<string, (typeof latestTxs)[0]>();
    for (const tx of latestTxs) {
      if (!latestByCustomer.has(tx.customerId)) {
        latestByCustomer.set(tx.customerId, tx);
      }
    }

    const duesWithLatestTx = items.map((d) => ({
      ...d,
      latestTransaction: latestByCustomer.get(d.customerId) ?? null,
    }));

    return toPaged(Due, {
      items: duesWithLatestTx,
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async create(due: Due): Promise<Due> {
    const entity = this.dueRepo.create({
      ...due,
      createdBy: due.createdBy,
      customer: due.customerId ? { id: due.customerId } : undefined,
      loan: due.loanId ? { id: due.loanId } : undefined,
    });
    const created = await this.dueRepo.save(entity);
    return plainToInstance(Due, created, { excludeExtraneousValues: true });
  }

  async bulkCreate(dues: Due[]): Promise<Due[]> {
    const entities = this.dueRepo.create(
      dues.map((d) => ({
        loanId: d.loanId,
        customerId: d.customerId,
        dueAmount: Number(d.dueAmount),
        principalAmount: Number(d.principalAmount),
        interestAmount: Number(d.interestAmount),
        type: d.type,
        dueDate: d.dueDate,
        createdBy: d.createdBy,
        customer: d.customerId ? { id: d.customerId } : undefined,
        loan: d.loanId ? { id: d.loanId } : undefined,
      })),
    );
    const created = await this.dueRepo.save(entities);
    return plainToInstance(Due, created, { excludeExtraneousValues: true });
  }

  async updatePastDues(): Promise<number> {
    const result = await this.dueRepo
      .createQueryBuilder()
      .update(DueEntity)
      .set({ type: EDueType.PAST_DUE })
      .where('dueDate < :now', { now: new Date() })
      .andWhere('type = :type', { type: EDueType.UPCOMING_DUE })
      .execute();
    return result.affected ?? 0;
  }

  async findById(id: string, createdBy: string): Promise<Due> {
    // TypeORM drops undefined conditions instead of matching nothing, so an
    // absent id would return an arbitrary due of this user's.
    if (!id) return null;
    const due = await this.dueRepo.findOne({
      where: { id, createdBy },
    });
    if (!due) return null;
    return plainToInstance(Due, due, { excludeExtraneousValues: true });
  }

  async findByIdWithDetails(id: string, createdBy: string): Promise<Due> {
    if (!id) return null;
    const due = await this.dueRepo.findOne({
      where: { id, createdBy },
      relations: ['customer'],
    });
    if (!due) return null;

    const latestTx = await this.dueRepo.manager
      .getRepository(TransactionEntity)
      .createQueryBuilder('t')
      .where('t.customerId = :customerId', { customerId: due.customerId })
      .orderBy('t.createdAt', 'DESC')
      .limit(1)
      .getOne();

    const result = { ...due, latestTransaction: latestTx };
    return plainToInstance(Due, result, { excludeExtraneousValues: true });
  }

  async update(id: string, due: Due): Promise<Due> {
    const {
      id: _omitId,
      customer,
      latestTransaction,
      createdBy: _omitCreatedBy,
      ...rest
    } = due as Due & { id?: string };
    const entityUpdate: UpdateDueEntityInput = rest;
    await this.dueRepo.update(id, entityUpdate);
    const updated = await this.dueRepo.findOne({ where: { id } });
    if (!updated) return null;
    return plainToInstance(Due, updated, { excludeExtraneousValues: true });
  }

  async deleteByLoanId(loanId: string, types?: EDueType[]): Promise<void> {
    const qb = this.dueRepo.createQueryBuilder().delete().from(DueEntity).where('loanId = :loanId', { loanId });
    if (types?.length) {
      qb.andWhere('type IN (:...types)', { types });
    }
    await qb.execute();
  }

  async deleteByLoanIdExcept(loanId: string, keepDueIds: string[]): Promise<void> {
    if (!loanId) return;
    const qb = this.dueRepo.createQueryBuilder().delete().from(DueEntity).where('loanId = :loanId', { loanId });
    if (keepDueIds?.length) {
      qb.andWhere('id NOT IN (:...keepDueIds)', { keepDueIds });
    }
    await qb.execute();
  }

  async findByLoanId(loanId: string): Promise<Due[]> {
    if (!loanId) return [];
    const dues = await this.dueRepo.find({
      where: { loanId },
      order: { dueDate: 'ASC' },
    });
    return plainToInstance(Due, dues, { excludeExtraneousValues: true });
  }

  async findByLoanIdAndType(loanId: string, types: EDueType[]): Promise<Due[]> {
    const dues = await this.dueRepo.find({
      where: { loanId, type: In(types) },
      order: { dueDate: 'ASC' },
    });
    return plainToInstance(Due, dues, { excludeExtraneousValues: true });
  }

  async findPendingWhatsAppDueReminders(): Promise<WhatsAppDueReminderCandidate[]> {
    const unpaidTypes = [EDueType.UPCOMING_DUE, EDueType.PAST_DUE, EDueType.OVERDUE];

    const rows = await this.dueRepo
      .createQueryBuilder('d')
      .innerJoin('d.customer', 'customer')
      .innerJoin('d.user', 'user')
      .innerJoin(
        'whatsapp_business_connections',
        'wbc',
        'wbc.user_id = d.created_by AND wbc.connection_status = :connected AND wbc.due_reminders_enabled = true',
        { connected: EWhatsAppConnectionStatus.Connected },
      )
      .where('d.type IN (:...unpaidTypes)', { unpaidTypes })
      .andWhere('d.whatsapp_reminder_sent_at IS NULL')
      .andWhere(`(d.due_date AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`)
      .andWhere('COALESCE(NULLIF(TRIM(customer.phone), \'\'), NULLIF(TRIM(customer.alternative_phone), \'\')) IS NOT NULL')
      .select([
        'd.id AS "dueId"',
        'd.created_by AS "userId"',
        'd.due_amount AS "dueAmount"',
        'customer.first_name AS "customerFirstName"',
        'COALESCE(NULLIF(TRIM(wbc.business_name), \'\'), NULLIF(TRIM(user.business_name), \'\'), \'Your business\') AS "businessName"',
        'COALESCE(NULLIF(TRIM(customer.phone), \'\'), NULLIF(TRIM(customer.alternative_phone), \'\')) AS "customerPhone"',
      ])
      .getRawMany<WhatsAppDueReminderCandidate>();

    return rows.map((row) => ({
      dueId: row.dueId,
      userId: row.userId,
      customerPhone: row.customerPhone,
      businessName: row.businessName,
      dueAmount: Number(row.dueAmount),
      customerFirstName: row.customerFirstName,
    }));
  }

  async markWhatsAppReminderSent(dueId: string): Promise<void> {
    if (!dueId) return;
    await this.dueRepo.update({ id: dueId }, { whatsappReminderSentAt: new Date() });
  }
}
