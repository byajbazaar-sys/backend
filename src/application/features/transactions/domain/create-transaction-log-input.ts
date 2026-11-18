import { ETransactionLogAction, ETransactionPaidIn, ETransactionType } from '../enums';

export interface CreateTransactionLogInput {
  transactionId?: string;
  loanId: string;
  action: ETransactionLogAction;
  transactionType?: ETransactionType;
  previousAmount?: number;
  newAmount?: number;
  previousPaidIn?: ETransactionPaidIn;
  newPaidIn?: ETransactionPaidIn;
  loanVersion?: number;
  performedBy: string;
  /** The shop that owns the loan; defaults to performedBy (owners make their own changes). */
  userId?: string;
}
