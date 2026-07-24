import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Paged, toCSV, toPDF, IPdfColumnConfig } from '@shared-libs';
import { DepositAccount, DepositTransaction } from '../domain';
import { DepositsDownloadFilterOptions, DepositsFilterOptions } from '../options';
import { EDepositStatus, EDepositTransactionType } from '../enums';
import { CUSTOMERS_REPOSITORY, ICustomersRepository } from '../../customers/service';
import { IDepositService } from './i-deposit.service';
import { DEPOSITS_REPOSITORY, DepositStats, IDepositsRepository } from './i-deposits.repository';

@Injectable()
export class DepositService implements IDepositService {
  constructor(
    @Inject(DEPOSITS_REPOSITORY) private readonly depositsRepo: IDepositsRepository,
    @Inject(CUSTOMERS_REPOSITORY) private readonly customersRepo: ICustomersRepository,
    @InjectPinoLogger(DepositService.name) private readonly logger: PinoLogger,
  ) {}

  async create(customerId: string, createdBy: string, data: { name?: string; notes?: string }): Promise<DepositAccount> {
    const customer = await this.customersRepo.findById(customerId, createdBy);
    if (!customer) throw new NotFoundException('Customer not found');

    const depositNumber = await this.depositsRepo.getNextDepositNumber(createdBy);
    return this.depositsRepo.createAccount({
      depositNumber,
      customerId,
      createdBy,
      name: data.name,
      notes: data.notes,
      currentBalance: 0,
      totalDeposited: 0,
      status: EDepositStatus.ACTIVE,
    });
  }

  async findAll(options: DepositsFilterOptions): Promise<Paged<DepositAccount>> {
    return this.depositsRepo.list(options);
  }

  async findOne(id: string, createdBy: string): Promise<DepositAccount> {
    const account = await this.depositsRepo.findById(id, createdBy);
    if (!account) throw new NotFoundException('Deposit account not found');
    const ledger = await this.depositsRepo.getLedger(id, createdBy);
    return { ...account, transactions: ledger };
  }

  async getStats(createdBy: string): Promise<DepositStats> {
    return this.depositsRepo.getStats(createdBy);
  }

  async getRecentTransactions(createdBy: string): Promise<DepositTransaction[]> {
    return this.depositsRepo.listRecentTransactions(createdBy, 10);
  }

  async addDeposit(
    id: string,
    createdBy: string,
    data: { amount: number; paymentMode: string; transactionReference?: string; depositDate?: string; remarks?: string },
  ): Promise<DepositAccount> {
    const account = await this.requireActiveAccount(id, createdBy);
    const amount = this.normalizeAmount(data.amount);
    const newBalance = Number(account.currentBalance) + amount;
    const transactionDate = data.depositDate ? new Date(data.depositDate) : new Date();

    const tx = await this.depositsRepo.createTransaction({
      depositAccountId: id,
      customerId: account.customerId,
      createdBy,
      type: EDepositTransactionType.DEPOSIT,
      amount,
      balanceAfter: newBalance,
      paymentMode: data.paymentMode,
      transactionReference: data.transactionReference,
      transactionDate,
      notes: data.remarks,
    });

    const receiptNumber = await this.generateReceiptNumber(createdBy, tx.id!);
    await this.depositsRepo.createReceipt({ depositTransactionId: tx.id!, receiptNumber, createdBy });

    const updated = await this.depositsRepo.updateAccount(id, createdBy, {
      currentBalance: newBalance,
      totalDeposited: Number(account.totalDeposited) + amount,
      status: EDepositStatus.ACTIVE,
    });

    this.logger.info({ depositId: id, amount, createdBy }, 'Deposit added');
    return this.findOne(updated!.id!, createdBy);
  }

  async adjust(
    id: string,
    createdBy: string,
    data: { amount: number; salesBillId?: string; remarks?: string },
  ): Promise<DepositAccount> {
    const account = await this.requireActiveAccount(id, createdBy);
    const amount = this.normalizeAmount(data.amount);
    const currentBalance = Number(account.currentBalance);
    if (amount > currentBalance) {
      throw new BadRequestException('Adjustment amount exceeds available deposit balance');
    }

    const newBalance = currentBalance - amount;
    await this.depositsRepo.createTransaction({
      depositAccountId: id,
      customerId: account.customerId,
      createdBy,
      type: EDepositTransactionType.ADJUSTMENT,
      amount,
      balanceAfter: newBalance,
      salesBillId: data.salesBillId,
      transactionDate: new Date(),
      notes: data.remarks,
    });

    await this.depositsRepo.updateAccount(id, createdBy, {
      currentBalance: newBalance,
      status: newBalance === 0 ? EDepositStatus.CLOSED : EDepositStatus.ACTIVE,
    });

    this.logger.info({ depositId: id, amount, salesBillId: data.salesBillId, createdBy }, 'Deposit adjusted');
    return this.findOne(id, createdBy);
  }

  async refund(
    id: string,
    createdBy: string,
    data: { amount: number; paymentMode: string; transactionReference?: string; remarks?: string },
  ): Promise<DepositAccount> {
    const account = await this.requireActiveAccount(id, createdBy);
    const amount = this.normalizeAmount(data.amount);
    const currentBalance = Number(account.currentBalance);
    if (amount > currentBalance) {
      throw new BadRequestException('Refund amount exceeds available deposit balance');
    }

    const newBalance = currentBalance - amount;
    const tx = await this.depositsRepo.createTransaction({
      depositAccountId: id,
      customerId: account.customerId,
      createdBy,
      type: EDepositTransactionType.REFUND,
      amount,
      balanceAfter: newBalance,
      paymentMode: data.paymentMode,
      transactionReference: data.transactionReference,
      transactionDate: new Date(),
      notes: data.remarks,
    });

    const receiptNumber = await this.generateReceiptNumber(createdBy, tx.id!);
    await this.depositsRepo.createReceipt({ depositTransactionId: tx.id!, receiptNumber, createdBy });

    await this.depositsRepo.updateAccount(id, createdBy, {
      currentBalance: newBalance,
      status: newBalance === 0 ? EDepositStatus.REFUNDED : EDepositStatus.ACTIVE,
    });

    this.logger.info({ depositId: id, amount, createdBy }, 'Deposit refunded');
    return this.findOne(id, createdBy);
  }

  async getLedger(id: string, createdBy: string): Promise<DepositTransaction[]> {
    await this.requireAccount(id, createdBy);
    return this.depositsRepo.getLedger(id, createdBy);
  }

  async download(options: DepositsDownloadFilterOptions, format: 'csv' | 'pdf'): Promise<Buffer> {
    const reportType = options.reportType ?? 'statement';
    if (reportType === 'active' || reportType === 'customer-history') {
      const accounts = await this.depositsRepo.listAccountsForDownload(options);
      const rows = accounts.map((a) => ({
        depositNumber: a.depositNumber,
        customer: `${a.customerFirstName ?? ''} ${a.customerLastName ?? ''}`.trim(),
        mobile: a.customerPhone ?? '',
        balance: a.currentBalance,
        totalDeposited: a.totalDeposited,
        status: a.status,
        createdAt: a.createdAt,
      }));
      if (format === 'csv') return Buffer.from(toCSV(rows), 'utf-8');
      const columns: IPdfColumnConfig[] = [
        { header: 'Deposit ID', key: 'depositNumber' },
        { header: 'Customer', key: 'customer' },
        { header: 'Mobile', key: 'mobile' },
        { header: 'Balance', key: 'balance', formatter: (v) => String(v) },
        { header: 'Total Deposited', key: 'totalDeposited', formatter: (v) => String(v) },
        { header: 'Status', key: 'status' },
      ];
      return toPDF(rows, columns, 'Deposit Accounts Report');
    }

    const transactions = await this.depositsRepo.listForDownload(options);
    const rows = transactions.map((t) => ({
      date: t.transactionDate,
      type: t.type,
      amount: t.amount,
      balance: t.balanceAfter,
      paymentMode: t.paymentMode ?? '',
      reference: t.transactionReference ?? '',
      notes: t.notes ?? '',
    }));
    if (format === 'csv') return Buffer.from(toCSV(rows), 'utf-8');
    const columns: IPdfColumnConfig[] = [
      { header: 'Date', key: 'date', formatter: (v) => new Date(v as string).toLocaleDateString() },
      { header: 'Type', key: 'type' },
      { header: 'Amount', key: 'amount', formatter: (v) => String(v) },
      { header: 'Balance', key: 'balance', formatter: (v) => String(v) },
      { header: 'Payment Mode', key: 'paymentMode' },
      { header: 'Reference', key: 'reference' },
      { header: 'Notes', key: 'notes' },
    ];
    return toPDF(rows, columns, 'Deposit Transactions Report');
  }

  private async requireAccount(id: string, createdBy: string): Promise<DepositAccount> {
    const account = await this.depositsRepo.findById(id, createdBy);
    if (!account) throw new NotFoundException('Deposit account not found');
    return account;
  }

  private async requireActiveAccount(id: string, createdBy: string): Promise<DepositAccount> {
    const account = await this.requireAccount(id, createdBy);
    if (account.status === EDepositStatus.CLOSED || account.status === EDepositStatus.REFUNDED) {
      throw new BadRequestException('Deposit account is not active');
    }
    return account;
  }

  private normalizeAmount(amount: number): number {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    return Math.round(value * 100) / 100;
  }

  private async generateReceiptNumber(createdBy: string, transactionId: string): Promise<string> {
    const suffix = transactionId.replace(/-/g, '').slice(0, 8).toUpperCase();
    return `RCP-${new Date().getFullYear()}-${suffix}`;
  }
}
