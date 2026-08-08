import { ETransactionPaidIn, ETransactionType } from '../enums';

export interface CreateTransactionInput {
  loanId: string;
  customerId: string;
  amount: number;
  transactionType: ETransactionType;
  paidIn: ETransactionPaidIn;
  createdBy: string;
  dueId?: string | null;
  amountRemainingDelta?: number;
  amountPaidDelta?: number;
  interestRemainingDelta?: number;
  interestPaidDelta?: number;
  periodsAtCreation?: number | null;
  loanSeq?: number | null;
}
