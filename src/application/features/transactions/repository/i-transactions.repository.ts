import { Transaction } from '../domain';
import { TransactionsFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { ETransactionType } from '../enums';

export const TRANSACTIONS_REPOSITORY = 'ITransactionsRepository';

export interface ITransactionsRepository {
  create(createTransactionDto: Transaction): Promise<Transaction>;
  findById(id: string): Promise<Transaction>;
  update(id: string, updateDto: Partial<Transaction>): Promise<Transaction>;
  listTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>>;
  findByLoanIdAndTransactionType(loanId: string, transactionType: ETransactionType): Promise<Transaction[]>;
  delete(id: string): Promise<void>;
}
