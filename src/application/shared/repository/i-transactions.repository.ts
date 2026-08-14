import { Paged } from '@shared-libs';

import {
  TransactionsFilterOptions,
  TransactionsDownloadFilterOptions,
  ETransactionType,
  ETransactionPaidIn,
  LoanEffect,
  Transaction,
  TransactionReplayPatch,
} from '../../features';
import { CreateTransactionInput } from '../../features/transactions/models';

export const TRANSACTIONS_REPOSITORY = 'ITransactionsRepository';

export interface ITransactionsRepository {
  create(createTransactionDto: CreateTransactionInput): Promise<Transaction>;
  findById(id: string, createdBy: string): Promise<Transaction>;
  listTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>>;
  listAllTransactions(params: TransactionsDownloadFilterOptions): Promise<Transaction[]>;
  findByLoanIdAndTransactionType(loanId: string, transactionType: ETransactionType): Promise<Transaction[]>;
  updatePaidIn(id: string, createdBy: string, paidIn: ETransactionPaidIn): Promise<Transaction>;
  updateAmount(
    id: string,
    createdBy: string,
    amount: number,
    effect?: LoanEffect,
    periodsAtCreation?: number,
  ): Promise<Transaction>;
  findLatestByLoanId(loanId: string, createdBy: string): Promise<Transaction>;
  /** Full history for a loan in apply order; the input to a replay. */
  findAllByLoanIdOrdered(loanId: string, createdBy: string): Promise<Transaction[]>;
  /** Rewrites the stored effect of a transaction that a replay re-applied. */
  applyReplayResult(id: string, createdBy: string, patch: TransactionReplayPatch): Promise<Transaction>;
  delete(id: string): Promise<void>;
  deleteByLoanId(loanId: string): Promise<void>;
}
