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
  public isLatest?: boolean;

  @Expose()
  public canDelete?: boolean;
}
