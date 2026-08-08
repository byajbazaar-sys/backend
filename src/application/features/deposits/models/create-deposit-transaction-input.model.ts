import { EDepositTransactionType } from '../enums';

export interface CreateDepositTransactionInput {
  depositAccountId: string;
  customerId: string;
  createdBy: string;
  type: EDepositTransactionType;
  amount: number;
  balanceAfter: number;
  paymentMode?: string;
  transactionReference?: string;
  transactionDate: Date;
  notes?: string;
  salesBillId?: string;
}
