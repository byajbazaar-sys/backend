import { Paged } from '@shared-libs';
import { Transaction } from '../domain';
import { TransactionsFilterOptions, TransactionsDownloadFilterOptions, DuesFilterOptions } from '../options';
import { Due } from '../../../shared';

export const TRANSACTION_SERVICE = 'ITransactionService';

export interface ITransactionService {
  create(data: Transaction): Promise<Transaction>;
  getById(id: string, createdBy: string): Promise<Transaction>;
  getTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>>;
  getTransactionsForDownload(params: TransactionsDownloadFilterOptions): Promise<Transaction[]>;
  delete(id: string, userId: string): Promise<void>;
  getDues(params: DuesFilterOptions): Promise<Paged<Due>>;
  getDueById(id: string, createdBy: string): Promise<Due>;
  updateDues(): Promise<number>;
}
