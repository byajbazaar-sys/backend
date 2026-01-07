import { Paged } from '@shared-libs';
import { Transaction, Due } from '../domain';
import { CreateTransactionRequestModel, UpdateTransactionRequestModel } from '../models';
import { TransactionsFilterOptions, DuesFilterOptions } from '../options';

export const TRANSACTION_SERVICE = 'ITransactionService';

export interface ITransactionService {
  create(data: Transaction): Promise<Transaction>;
  getById(id: string): Promise<Transaction>;
  getTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>>;
  update(id: string, body: UpdateTransactionRequestModel, userId: string): Promise<Transaction>;
  delete(id: string, userId: string): Promise<void>;
  getDues(params: DuesFilterOptions): Promise<Paged<Due>>;
}
