import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { plainToInstance } from 'class-transformer';
import {
  ETransactionType,
  ITransactionsRepository,
  Transaction,
  TransactionsFilterOptions,
  TransactionsDownloadFilterOptions,
} from '../../../application';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';

@Injectable()
export class TransactionsRepository implements ITransactionsRepository {
  constructor(
    @InjectRepository(TransactionEntity) private transactionRepo: Repository<TransactionEntity>,
  ) { }

  async create(createTransaction: Partial<Transaction>): Promise<Transaction> {
    const entity = this.transactionRepo.create({
      loanId: createTransaction.loanId,
      customerId: createTransaction.customerId,
      amount: createTransaction.amount,
      transactionType: createTransaction.transactionType,
      paidIn: createTransaction.paidIn,
      createdBy: createTransaction.createdBy,
      dueId: createTransaction.dueId ?? null,
    } as unknown as Partial<TransactionEntity>);
    const created = await this.transactionRepo.save(entity);
    return plainToInstance(Transaction, created, { excludeExtraneousValues: true });
  }

  async findById(id: string, createdBy: string): Promise<Transaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id, createdBy: createdBy },
      relations: ['customer'],
    });
    if (!transaction) return null;
    return plainToInstance(Transaction, transaction, { excludeExtraneousValues: true });
  }

  async listTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>> {
    const { loanId, createdBy } = params;
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField === 'paidAt' ? 'createdAt' : (params.sortField || 'createdAt');

    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.customer', 'customer')
      .select([
        't.id',
        't.loanId',
        't.customerId',
        't.amount',
        't.transactionType',
        't.paidIn',
        't.createdBy',
        't.dueId',
        't.createdAt',
        'customer.id',
        'customer.firstName',
        'customer.lastName',
      ]);

    if (loanId) qb.andWhere('t.loan_id = :loanId', { loanId });
    if (createdBy) qb.andWhere('t.created_by = :createdBy', { createdBy });

    const [items, totalCount] = await qb
      .orderBy(`t.${sortField}`, sortOrder)
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    return toPaged(Transaction, {
      items,
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async listAllTransactions(params: TransactionsDownloadFilterOptions): Promise<Transaction[]> {
    const { loanId, createdBy, startDate, endDate } = params;
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField === 'paidAt' ? 'createdAt' : (params.sortField || 'createdAt');

    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.customer', 'customer')
      .select([
        't.id',
        't.loanId',
        't.customerId',
        't.amount',
        't.transactionType',
        't.paidIn',
        't.createdBy',
        't.dueId',
        't.createdAt',
        'customer.id',
        'customer.firstName',
        'customer.lastName',
      ]);

    if (loanId) qb.andWhere('t.loan_id = :loanId', { loanId });
    if (createdBy) qb.andWhere('t.created_by = :createdBy', { createdBy });
    if (startDate) qb.andWhere('t.created_at >= :startDate', { startDate });
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      qb.andWhere('t.created_at <= :endDate', { endDate: endOfDay });
    }

    const items = await qb.orderBy(`t.${sortField}`, sortOrder).getMany();
    return plainToInstance(Transaction, items, { excludeExtraneousValues: true });
  }

  async findByLoanIdAndTransactionType(
    loanId: string,
    transactionType: ETransactionType,
  ): Promise<Transaction[]> {
    const transactions = await this.transactionRepo.find({
      where: { loanId, transactionType },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(Transaction, transactions, { excludeExtraneousValues: true });
  }

  async delete(id: string): Promise<void> {
    await this.transactionRepo.delete(id);
  }

  async deleteByLoanId(loanId: string): Promise<void> {
    await this.transactionRepo.delete({ loanId });
  }
}
