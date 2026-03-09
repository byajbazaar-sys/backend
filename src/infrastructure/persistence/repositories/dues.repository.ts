import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DueEntity } from '../entities/due.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { plainToInstance } from 'class-transformer';
import { Due, DuesFilterOptions, IDuesRepository, EDueType } from '../../../application';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';

@Injectable()
export class DuesRepository implements IDuesRepository {
  constructor(@InjectRepository(DueEntity) private dueRepo: Repository<DueEntity>) { }

  async listDues(params: DuesFilterOptions): Promise<Paged<Due>> {
    const { loanIds, createdBy, type, customerName } = params;
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'dueDate';

    const qb = this.dueRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer');

    if (loanIds?.length) qb.andWhere('d.loanId IN (:...loanIds)', { loanIds });
    if (createdBy) qb.andWhere('d.created_by = :createdBy', { createdBy });
    if (type?.length) qb.andWhere('d.type IN (:...type)', { type });
    if (customerName) {
      qb.andWhere(
        '(customer.first_name ILIKE :name OR customer.last_name ILIKE :name)',
        { name: `%${customerName}%` },
      );
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
    const latestByCustomer = new Map<string, typeof latestTxs[0]>();
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
        ...d,
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
    const due = await this.dueRepo.findOne({
      where: { id, createdBy: createdBy },
    });
    if (!due) return null;
    return plainToInstance(Due, due, { excludeExtraneousValues: true });
  }

  async findByIdWithDetails(id: string, createdBy: string): Promise<Due> {
    const due = await this.dueRepo.findOne({
      where: { id, createdBy: createdBy },
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
    const { id: _omitId, customer, latestTransaction, createdBy: _omitCreatedBy, ...rest } = due as Due & { id?: string };
    await this.dueRepo.update(id, rest as Partial<DueEntity>);
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

  async findByLoanIdAndType(loanId: string, types: EDueType[]): Promise<Due[]> {
    const dues = await this.dueRepo.find({
      where: { loanId, type: In(types) },
      order: { dueDate: 'ASC' },
    });
    return plainToInstance(Due, dues, { excludeExtraneousValues: true });
  }
}
