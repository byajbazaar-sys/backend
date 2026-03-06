import { Expose, Type } from 'class-transformer';
import { ETransactionType, ETransactionPaidIn } from '../enums';
import { Customer } from '../../customers';

export class Transaction {
  @Expose()
  public id: string;

  @Expose()
  public loanId: string;

  @Expose()
  public customerId: string;

  @Expose()
  public amount: number;

  @Expose()
  public transactionType: ETransactionType;

  @Expose()
  public paidIn: ETransactionPaidIn;

  @Expose()
  @Type(() => Date)
  public paidAt: Date;

  @Expose()
  public createdBy: string;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;

  @Expose()
  @Type(() => Customer)
  public customer: Customer;

  @Expose()
  public dueId?: string;
}
