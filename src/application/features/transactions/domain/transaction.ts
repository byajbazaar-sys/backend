import { Expose, Type } from 'class-transformer';
import { ETransactionType, ETransactionPaidIn } from '../enums';
import { Customer } from '../../customers';
import { Due } from '../../../shared';

export class Transaction {
  @Expose()
  public id: string;

  @Expose()
  public loanId: string;

  @Expose()
  public customerId: string;

  @Expose()
  @Type(() => Number)
  public amount: number;

  @Expose()
  public transactionType: ETransactionType;

  @Expose()
  public paidIn: ETransactionPaidIn;

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

  @Expose()
  @Type(() => Due)
  public due?: Due;

  @Expose()
  @Type(() => Number)
  public amountRemainingDelta?: number;

  @Expose()
  @Type(() => Number)
  public amountPaidDelta?: number;

  @Expose()
  @Type(() => Number)
  public interestRemainingDelta?: number;

  @Expose()
  @Type(() => Number)
  public interestPaidDelta?: number;

  @Expose()
  @Type(() => Number)
  public periodsAtCreation?: number;

  @Expose()
  @Type(() => Number)
  public loanSeq?: number;
}
