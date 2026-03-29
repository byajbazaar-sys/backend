import { Paged } from '@shared-libs';
import { TransactionsFilterOptions, TransactionsDownloadFilterOptions, ETransactionType, Transaction } from '../../features';

export const TRANSACTIONS_REPOSITORY = 'ITransactionsRepository';

export interface ITransactionsRepository {
  create(createTransactionDto: Transaction): Promise<Transaction>;
  findById(id: string, createdBy: string): Promise<Transaction>;
  listTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>>;
  listAllTransactions(params: TransactionsDownloadFilterOptions): Promise<Transaction[]>;
  findByLoanIdAndTransactionType(loanId: string, transactionType: ETransactionType): Promise<Transaction[]>;
  delete(id: string): Promise<void>;
  deleteByLoanId(loanId: string): Promise<void>;
}
