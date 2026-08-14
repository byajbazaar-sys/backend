import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  ETransactionType,
  ETransactionPaidIn,
  ITransactionsRepository,
  LoanEffect,
  Transaction,
  TransactionReplayPatch,
  TransactionsFilterOptions,
  TransactionsDownloadFilterOptions,
} from '../../../application';
import { CreateTransactionInput } from '../../../application/features/transactions/models';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionalContext } from '../transactional-context';

@Injectable()
export class TransactionsRepository implements ITransactionsRepository {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly defaultTransactionRepo: Repository<TransactionEntity>,
  ) {}

  private get transactionRepo(): Repository<TransactionEntity> {
    return TransactionalContext.repositoryFor(TransactionEntity, this.defaultTransactionRepo);
  }

  async create(createTransaction: CreateTransactionInput): Promise<Transaction> {
    const entity = this.transactionRepo.create({
      loanId: createTransaction.loanId,
      customerId: createTransaction.customerId,
      amount: createTransaction.amount,
      transactionType: createTransaction.transactionType,
      paidIn: createTransaction.paidIn,
      createdBy: createTransaction.createdBy,
      dueId: createTransaction.dueId ?? null,
      amountRemainingDelta: createTransaction.amountRemainingDelta ?? 0,
      amountPaidDelta: createTransaction.amountPaidDelta ?? 0,
      interestRemainingDelta: createTransaction.interestRemainingDelta ?? 0,
      interestPaidDelta: createTransaction.interestPaidDelta ?? 0,
      periodsAtCreation: createTransaction.periodsAtCreation ?? null,
      loanSeq: createTransaction.loanSeq ?? null,
    } as unknown as Partial<TransactionEntity>);
    const created = await this.transactionRepo.save(entity);
    return plainToInstance(Transaction, created, { excludeExtraneousValues: true });
  }

  async findById(id: string, createdBy: string): Promise<Transaction> {
    if (!id) return null;
    const transaction = await this.transactionRepo.findOne({
      where: { id, createdBy },
      relations: ['customer', 'due'],
    });
    if (!transaction) return null;
    return plainToInstance(Transaction, transaction, { excludeExtraneousValues: true });
  }

  async listTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>> {
    const { loanId, createdBy } = params;
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField === 'paidAt' ? 'createdAt' : params.sortField || 'createdAt';

    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoin('t.customer', 'customer')
      .leftJoin('t.due', 'due')
      .select([
        't.id',
        't.loanId',
        't.customerId',
        't.amount',
        't.transactionType',
        't.paidIn',
        't.createdBy',
        't.dueId',
        't.loanSeq',
        't.createdAt',
        'customer.id',
        'customer.firstName',
        'customer.lastName',
      ])
      .addSelect([
        'due.id',
        'due.dueDate',
        'due.loanId',
        'due.dueAmount',
        'due.principalAmount',
        'due.interestAmount',
        'due.type',
        'due.customerId',
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
    const sortField = params.sortField === 'paidAt' ? 'createdAt' : params.sortField || 'createdAt';

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
        't.loanSeq',
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

  async findByLoanIdAndTransactionType(loanId: string, transactionType: ETransactionType): Promise<Transaction[]> {
    const transactions = await this.transactionRepo.find({
      where: { loanId, transactionType },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(Transaction, transactions, { excludeExtraneousValues: true });
  }

  async updatePaidIn(id: string, createdBy: string, paidIn: ETransactionPaidIn): Promise<Transaction> {
    if (!id) return null;
    const existing = await this.transactionRepo.findOne({
      where: { id, createdBy },
      relations: ['customer', 'due'],
    });
    if (!existing) return null;
    existing.paidIn = paidIn;
    const saved = await this.transactionRepo.save(existing);
    return plainToInstance(Transaction, saved, { excludeExtraneousValues: true });
  }

  async updateAmount(
    id: string,
    createdBy: string,
    amount: number,
    effect?: LoanEffect,
    periodsAtCreation?: number,
  ): Promise<Transaction> {
    if (!id) return null;
    const existing = await this.transactionRepo.findOne({
      where: { id, createdBy },
      relations: ['customer', 'due'],
    });
    if (!existing) return null;
    existing.amount = amount;
    if (effect) {
      existing.amountRemainingDelta = effect.amountRemainingDelta;
      existing.amountPaidDelta = effect.amountPaidDelta;
      existing.interestRemainingDelta = effect.interestRemainingDelta;
      existing.interestPaidDelta = effect.interestPaidDelta;
    }
    if (periodsAtCreation !== undefined) {
      existing.periodsAtCreation = periodsAtCreation;
    }
    const saved = await this.transactionRepo.save(existing);
    return plainToInstance(Transaction, saved, { excludeExtraneousValues: true });
  }

  /**
   * loan_seq decides the order, not created_at: it is allocated atomically,
   * whereas created_at is the transaction's start time and can tie between two
   * writers that began before either took the loan lock. Rows predating the seq
   * backfill sort last so any sequenced row still wins over them.
   */
  async findLatestByLoanId(loanId: string, createdBy: string): Promise<Transaction> {
    const entity = await this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.due', 'due')
      .where('t.loanId = :loanId', { loanId })
      .andWhere('t.createdBy = :createdBy', { createdBy })
      .orderBy('t.loanSeq', 'DESC', 'NULLS LAST')
      .addOrderBy('t.createdAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .getOne();
    if (!entity) return null;
    return plainToInstance(Transaction, entity, { excludeExtraneousValues: true });
  }

  /**
   * Ascending counterpart of findLatestByLoanId: same ordering rules, so a
   * replay applies transactions in exactly the order they were recorded.
   */
  async findAllByLoanIdOrdered(loanId: string, createdBy: string): Promise<Transaction[]> {
    if (!loanId) return [];
    const entities = await this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.due', 'due')
      .where('t.loanId = :loanId', { loanId })
      .andWhere('t.createdBy = :createdBy', { createdBy })
      .orderBy('t.loanSeq', 'ASC', 'NULLS FIRST')
      .addOrderBy('t.createdAt', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
    return plainToInstance(Transaction, entities, { excludeExtraneousValues: true });
  }

  async applyReplayResult(id: string, createdBy: string, patch: TransactionReplayPatch): Promise<Transaction> {
    if (!id) return null;
    const existing = await this.transactionRepo.findOne({
      where: { id, createdBy },
      relations: ['customer', 'due'],
    });
    if (!existing) return null;

    if (patch.amount !== undefined) {
      existing.amount = patch.amount;
    }
    if (patch.dueId !== undefined) {
      existing.dueId = patch.dueId;
    }
    existing.amountRemainingDelta = patch.effect.amountRemainingDelta;
    existing.amountPaidDelta = patch.effect.amountPaidDelta;
    existing.interestRemainingDelta = patch.effect.interestRemainingDelta;
    existing.interestPaidDelta = patch.effect.interestPaidDelta;
    // Left untouched when the replay did not compute one, so a top-up keeps the
    // tenure it was originally priced against.
    if (patch.periodsAtCreation !== undefined) {
      existing.periodsAtCreation = patch.periodsAtCreation;
    }

    const saved = await this.transactionRepo.save(existing);
    return plainToInstance(Transaction, saved, { excludeExtraneousValues: true });
  }

  async delete(id: string): Promise<void> {
    await this.transactionRepo.delete(id);
  }

  async deleteByLoanId(loanId: string): Promise<void> {
    await this.transactionRepo.delete({ loanId });
  }
}
