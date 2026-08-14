import { Paged } from '@shared-libs';

import { DepositAccount, DepositTransaction, CreateDepositReceiptData, DepositReceiptResult } from '../domain';
import { CreateDepositAccountInput, CreateDepositTransactionInput, UpdateDepositAccountPatch } from '../models';
import { DepositsFilterOptions, DepositsDownloadFilterOptions } from '../options';
import { DepositStats } from './deposit-stats';

export const DEPOSITS_REPOSITORY = 'DEPOSITS_REPOSITORY';

export interface IDepositsRepository {
  createAccount(account: CreateDepositAccountInput): Promise<DepositAccount>;
  findById(id: string, createdBy: string): Promise<DepositAccount>;
  list(options: DepositsFilterOptions): Promise<Paged<DepositAccount>>;
  updateAccount(id: string, createdBy: string, data: UpdateDepositAccountPatch): Promise<DepositAccount>;
  getNextDepositNumber(createdBy: string): Promise<string>;
  getStats(createdBy: string): Promise<DepositStats>;
  listRecentTransactions(createdBy: string, limit?: number): Promise<DepositTransaction[]>;
  createTransaction(tx: CreateDepositTransactionInput): Promise<DepositTransaction>;
  createReceipt(data: CreateDepositReceiptData): Promise<DepositReceiptResult>;
  getLedger(depositAccountId: string, createdBy: string): Promise<DepositTransaction[]>;
  listForDownload(options: DepositsDownloadFilterOptions): Promise<DepositTransaction[]>;
  listAccountsForDownload(options: DepositsDownloadFilterOptions): Promise<DepositAccount[]>;
  deleteAccount(id: string, createdBy: string): Promise<boolean>;
}
