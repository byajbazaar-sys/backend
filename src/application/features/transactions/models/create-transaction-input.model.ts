import { ETransactionPaidIn, ETransactionType } from '../enums';

export interface CreateTransactionInput {
  loanId: string;
  customerId: string;
  amount: number;
  transactionType: ETransactionType;
  paidIn: ETransactionPaidIn;
  createdBy: string;
  dueId?: string;
  amountRemainingDelta?: number;
  amountPaidDelta?: number;
  interestRemainingDelta?: number;
  interestPaidDelta?: number;
  periodsAtCreation?: number;
  loanSeq?: number;
}
