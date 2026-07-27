import { DepositAccount, DepositTransaction } from '../domain';
import { DepositsFilterOptions, DepositsDownloadFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { EDepositTransactionType } from '../enums';

export const DEPOSITS_REPOSITORY = 'DEPOSITS_REPOSITORY';

export interface DepositStats {
  totalDeposits: number;
  activeAccounts: number;
  totalBalance: number;
  recentTransactionCount: number;
}

export interface IDepositsRepository {
  createAccount(account: Partial<DepositAccount>): Promise<DepositAccount>;
  findById(id: string, createdBy: string): Promise<DepositAccount | null>;
  list(options: DepositsFilterOptions): Promise<Paged<DepositAccount>>;
  updateAccount(id: string, createdBy: string, data: Partial<DepositAccount>): Promise<DepositAccount | null>;
  getNextDepositNumber(createdBy: string): Promise<string>;
  getStats(createdBy: string): Promise<DepositStats>;
  listRecentTransactions(createdBy: string, limit?: number): Promise<DepositTransaction[]>;
  createTransaction(tx: Partial<DepositTransaction>): Promise<DepositTransaction>;
  createReceipt(data: { depositTransactionId: string; receiptNumber: string; createdBy: string }): Promise<{ receiptNumber: string }>;
  getLedger(depositAccountId: string, createdBy: string): Promise<DepositTransaction[]>;
  listForDownload(options: DepositsDownloadFilterOptions): Promise<DepositTransaction[]>;
  listAccountsForDownload(options: DepositsDownloadFilterOptions): Promise<DepositAccount[]>;
  deleteAccount(id: string, createdBy: string): Promise<boolean>;
}
