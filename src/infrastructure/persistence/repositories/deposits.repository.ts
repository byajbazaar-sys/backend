import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ESortOrder, getPaginationValues, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  DepositAccount,
  DepositTransaction,
  CreateDepositReceiptData,
  DepositReceiptResult,
} from '../../../application/features/deposits/domain';
import { EDepositStatus, EDepositTransactionType } from '../../../application/features/deposits/enums';
import {
  CreateDepositAccountInput,
  CreateDepositTransactionInput,
  UpdateDepositAccountPatch,
} from '../../../application/features/deposits/models';
import { DepositsFilterOptions, DepositsDownloadFilterOptions } from '../../../application/features/deposits/options';
import { DepositStats } from '../../../application/features/deposits/service/deposit-stats';
import { IDepositsRepository } from '../../../application/features/deposits/service/i-deposits.repository';
import { DepositAccountEntity } from '../entities/deposit-account.entity';
import { DepositReceiptEntity } from '../entities/deposit-receipt.entity';
import { DepositTransactionEntity } from '../entities/deposit-transaction.entity';

@Injectable()
export class DepositsRepository implements IDepositsRepository {
  constructor(
    @InjectRepository(DepositAccountEntity) private readonly accountRepo: Repository<DepositAccountEntity>,
    @InjectRepository(DepositTransactionEntity) private readonly txRepo: Repository<DepositTransactionEntity>,
    @InjectRepository(DepositReceiptEntity) private readonly receiptRepo: Repository<DepositReceiptEntity>,
  ) {}

  async createAccount(account: CreateDepositAccountInput): Promise<DepositAccount> {
    const entity = this.accountRepo.create(account);
    const saved = await this.accountRepo.save(entity);
    return this.mapAccount(saved);
  }

  async findById(id: string, createdBy: string): Promise<DepositAccount> {
    const row = await this.accountRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.customer', 'customer')
      .where('a.id = :id', { id })
      .andWhere('a.createdBy = :createdBy', { createdBy })
      .getOne();
    if (!row) return null;
    return this.mapAccount(row);
  }

  async list(options: DepositsFilterOptions) {
    const { pageNumber, pageSize, skip } = getPaginationValues({
      pageNumber: options.page,
      pageSize: options.limit,
    });
    const qb = this.accountRepo
      .createQueryBuilder('a')
      .leftJoin('a.customer', 'customer')
      .addSelect(['customer.firstName', 'customer.lastName', 'customer.phone'])
      .where('a.createdBy = :createdBy', { createdBy: options.createdBy });

    if (options.status) qb.andWhere('a.status = :status', { status: options.status });
    if (options.customerId) qb.andWhere('a.customerId = :customerId', { customerId: options.customerId });
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(a.depositNumber ILIKE :q OR customer.firstName ILIKE :q OR customer.lastName ILIKE :q OR customer.phone ILIKE :q)',
        { q },
      );
    }

    const sortField = options.sortField === 'currentBalance' ? 'a.currentBalance' : 'a.createdAt';
    const sortOrder = options.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    qb.orderBy(sortField, sortOrder);

    const [rows, totalCount] = await qb.skip(skip).take(pageSize).getManyAndCount();
    const items = rows.map((r) => this.mapAccount(r));
    return toPaged(DepositAccount, { items, page: pageNumber, perPage: pageSize, totalCount });
  }

  async updateAccount(id: string, createdBy: string, data: UpdateDepositAccountPatch): Promise<DepositAccount> {
    const existing = await this.accountRepo.findOne({ where: { id, createdBy } });
    if (!existing) return null;
    Object.assign(existing, data);
    const saved = await this.accountRepo.save(existing);
    return this.mapAccount(saved);
  }

  async getNextDepositNumber(createdBy: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DEP-${year}-`;
    const last = await this.accountRepo
      .createQueryBuilder('a')
      .where('a.createdBy = :createdBy', { createdBy })
      .andWhere('a.depositNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('a.depositNumber', 'DESC')
      .getOne();
    const lastSeq = last ? Number(last.depositNumber.replace(prefix, '')) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(5, '0')}`;
  }

  async getStats(createdBy: string): Promise<DepositStats> {
    const raw = await this.accountRepo
      .createQueryBuilder('a')
      .select('COUNT(*)', 'totalDeposits')
      .addSelect(`SUM(CASE WHEN a.status = '${EDepositStatus.ACTIVE}' THEN 1 ELSE 0 END)`, 'activeAccounts')
      .addSelect('COALESCE(SUM(a.currentBalance), 0)', 'totalBalance')
      .where('a.createdBy = :createdBy', { createdBy })
      .getRawOne();

    const recentCount = await this.txRepo
      .createQueryBuilder('t')
      .where('t.createdBy = :createdBy', { createdBy })
      .andWhere('t.createdAt >= :since', { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
      .getCount();

    return {
      totalDeposits: Number(raw?.totalDeposits ?? 0),
      activeAccounts: Number(raw?.activeAccounts ?? 0),
      totalBalance: Number(raw?.totalBalance ?? 0),
      recentTransactionCount: recentCount,
    };
  }

  async listRecentTransactions(createdBy: string, limit = 10): Promise<DepositTransaction[]> {
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .leftJoin('t.depositAccount', 'a')
      .leftJoin('t.receipt', 'r')
      .leftJoin('t.user', 'u')
      .addSelect(['a.depositNumber', 'r.receiptNumber', 'u.firstName', 'u.lastName'])
      .where('t.createdBy = :createdBy', { createdBy })
      .orderBy('t.transactionDate', 'DESC')
      .take(limit)
      .getMany();
    return rows.map((r) => this.mapTransaction(r));
  }

  async createTransaction(tx: CreateDepositTransactionInput): Promise<DepositTransaction> {
    const entity = this.txRepo.create(tx);
    const saved = await this.txRepo.save(entity);
    return this.mapTransaction(saved);
  }

  async createReceipt(data: CreateDepositReceiptData): Promise<DepositReceiptResult> {
    await this.receiptRepo.save(this.receiptRepo.create(data));
    return { receiptNumber: data.receiptNumber };
  }

  async getLedger(depositAccountId: string, createdBy: string): Promise<DepositTransaction[]> {
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .leftJoin('t.receipt', 'r')
      .leftJoin('t.user', 'u')
      .addSelect(['r.receiptNumber', 'u.firstName', 'u.lastName'])
      .where('t.depositAccountId = :depositAccountId', { depositAccountId })
      .andWhere('t.createdBy = :createdBy', { createdBy })
      .orderBy('t.transactionDate', 'ASC')
      .addOrderBy('t.createdAt', 'ASC')
      .getMany();
    return rows.map((r) => this.mapTransaction(r));
  }

  async listForDownload(options: DepositsDownloadFilterOptions): Promise<DepositTransaction[]> {
    const qb = this.txRepo
      .createQueryBuilder('t')
      .leftJoin('t.depositAccount', 'a')
      .leftJoin('a.customer', 'customer')
      .leftJoin('t.receipt', 'r')
      .where('t.createdBy = :createdBy', { createdBy: options.createdBy });

    if (options.startDate) qb.andWhere('t.transactionDate >= :startDate', { startDate: options.startDate });
    if (options.endDate) qb.andWhere('t.transactionDate <= :endDate', { endDate: options.endDate });
    if (options.status) qb.andWhere('a.status = :status', { status: options.status });
    if (options.reportType === 'refunds') {
      qb.andWhere('t.type = :type', { type: EDepositTransactionType.REFUND });
    } else if (options.reportType === 'daily-collection') {
      qb.andWhere('t.type = :type', { type: EDepositTransactionType.DEPOSIT });
    }
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(a.depositNumber ILIKE :q OR customer.firstName ILIKE :q OR customer.lastName ILIKE :q OR customer.phone ILIKE :q)',
        { q },
      );
    }

    const rows = await qb.orderBy('t.transactionDate', 'DESC').getMany();
    return rows.map((r) => this.mapTransaction(r));
  }

  async listAccountsForDownload(options: DepositsDownloadFilterOptions): Promise<DepositAccount[]> {
    const qb = this.accountRepo
      .createQueryBuilder('a')
      .leftJoin('a.customer', 'customer')
      .addSelect(['customer.firstName', 'customer.lastName', 'customer.phone'])
      .where('a.createdBy = :createdBy', { createdBy: options.createdBy });

    if (options.status) qb.andWhere('a.status = :status', { status: options.status });
    if (options.reportType === 'active') qb.andWhere('a.status = :active', { active: EDepositStatus.ACTIVE });
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      qb.andWhere(
        '(a.depositNumber ILIKE :q OR customer.firstName ILIKE :q OR customer.lastName ILIKE :q OR customer.phone ILIKE :q)',
        { q },
      );
    }

    const rows = await qb.orderBy('a.createdAt', 'DESC').getMany();
    return rows.map((r) => this.mapAccount(r));
  }

  async deleteAccount(id: string, createdBy: string): Promise<boolean> {
    const result = await this.accountRepo.delete({ id, createdBy });
    return (result.affected ?? 0) > 0;
  }

  private mapAccount(entity: DepositAccountEntity): DepositAccount {
    const customer = (
      entity as DepositAccountEntity & { customer?: { firstName?: string; lastName?: string; phone?: string } }
    ).customer;
    return plainToInstance(
      DepositAccount,
      {
        ...entity,
        currentBalance: Number(entity.currentBalance),
        totalDeposited: Number(entity.totalDeposited),
        customerFirstName: customer?.firstName,
        customerLastName: customer?.lastName,
        customerPhone: customer?.phone,
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapTransaction(entity: DepositTransactionEntity): DepositTransaction {
    const receipt = (entity as DepositTransactionEntity & { receipt?: { receiptNumber?: string } }).receipt;
    const user = (entity as DepositTransactionEntity & { user?: { firstName?: string; lastName?: string } }).user;
    const staffName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : undefined;
    return plainToInstance(
      DepositTransaction,
      {
        ...entity,
        amount: Number(entity.amount),
        balanceAfter: Number(entity.balanceAfter),
        receiptNumber: receipt?.receiptNumber,
        staffName,
      },
      { excludeExtraneousValues: true },
    );
  }
}
