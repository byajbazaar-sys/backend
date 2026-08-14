import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { TransactionLogEntity } from '../entities/transaction-log.entity';
import { TransactionalContext } from '../transactional-context';
import {
  CreateTransactionLogInput,
  ITransactionLogsRepository,
  TransactionLog,
} from '../../../application';

@Injectable()
export class TransactionLogsRepository implements ITransactionLogsRepository {
  constructor(
    @InjectRepository(TransactionLogEntity)
    private readonly defaultRepo: Repository<TransactionLogEntity>,
  ) { }

  private get repo(): Repository<TransactionLogEntity> {
    return TransactionalContext.repositoryFor(TransactionLogEntity, this.defaultRepo);
  }

  async create(input: CreateTransactionLogInput): Promise<TransactionLog> {
    const entity = this.repo.create({
      transactionId: input.transactionId ?? null,
      loanId: input.loanId,
      action: input.action,
      transactionType: input.transactionType ?? null,
      previousAmount: input.previousAmount ?? null,
      newAmount: input.newAmount ?? null,
      previousPaidIn: input.previousPaidIn ?? null,
      newPaidIn: input.newPaidIn ?? null,
      loanVersion: input.loanVersion ?? null,
      performedBy: input.performedBy,
    });
    const saved = await this.repo.save(entity);
    return plainToInstance(TransactionLog, saved, { excludeExtraneousValues: true });
  }

  async findByTransactionId(transactionId: string, createdBy: string): Promise<TransactionLog[]> {
    if (!transactionId) return [];
    const rows = await this.repo
      .createQueryBuilder('log')
      .innerJoin('log.loan', 'loan')
      .where('log.transactionId = :transactionId', { transactionId })
      .andWhere('loan.createdBy = :createdBy', { createdBy })
      .orderBy('log.createdAt', 'ASC')
      .getMany();
    return plainToInstance(TransactionLog, rows, { excludeExtraneousValues: true });
  }
}
