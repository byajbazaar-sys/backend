import { Expose, Type } from 'class-transformer';
import { ETransactionLogAction, ETransactionPaidIn, ETransactionType } from '../enums';

export class TransactionLog {
  @Expose()
  public id: string;

  @Expose()
  public transactionId?: string;

  @Expose()
  public loanId: string;

  @Expose()
  public action: ETransactionLogAction;

  @Expose()
  public transactionType?: ETransactionType;

  @Expose()
  @Type(() => Number)
  public previousAmount?: number;

  @Expose()
  @Type(() => Number)
  public newAmount?: number;

  @Expose()
  public previousPaidIn?: ETransactionPaidIn;

  @Expose()
  public newPaidIn?: ETransactionPaidIn;

  @Expose()
  @Type(() => Number)
  public loanVersion?: number;

  @Expose()
  public performedBy: string;

  @Expose()
  @Type(() => Date)
  public createdAt: Date;
}

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
}
