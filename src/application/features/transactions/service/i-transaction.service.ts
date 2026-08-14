import { Paged } from '@shared-libs';

import { Due } from '../../../shared';
import { Transaction, TransactionLog, UpdateTransactionData } from '../domain';
import { TransactionsFilterOptions, TransactionsDownloadFilterOptions, DuesFilterOptions } from '../options';

export const TRANSACTION_SERVICE = 'ITransactionService';

/**
 * `expectedLoanVersion` is the loan version the caller's view was based on. When
 * supplied, the write is rejected with 409 if the loan has moved on since — this
 * is what stops a stale form from overwriting someone else's change.
 */
export interface ITransactionService {
  create(data: Transaction, expectedLoanVersion?: number): Promise<Transaction>;
  getById(id: string, createdBy: string): Promise<Transaction>;
  getTransactionDetail(id: string, createdBy: string): Promise<{ transaction: Transaction; logs: TransactionLog[] }>;
  update(id: string, updates: UpdateTransactionData, createdBy: string): Promise<Transaction>;
  getTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>>;
  getTransactionsForDownload(params: TransactionsDownloadFilterOptions): Promise<Transaction[]>;
  delete(id: string, userId: string, expectedLoanVersion?: number): Promise<void>;
  getDues(params: DuesFilterOptions): Promise<Paged<Due>>;
  getDueById(id: string, createdBy: string): Promise<Due>;
  updateDues(): Promise<number>;
}
