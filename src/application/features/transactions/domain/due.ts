import { Expose, Type } from 'class-transformer';
import { EDueType } from '../../../shared';
import { Customer } from '../../customers';
import { Transaction } from './transaction';

export class Due {
  @Expose()
  public id?: string;

  @Expose()
  public type: EDueType;

  @Expose()
  @Type(() => Date)
  public dueDate: Date;

  @Expose()
  public loanId: string;

  @Expose()
  public dueAmount: number;

  @Expose()
  public customerId?: string;

  @Expose()
  public createdBy?: string;

  @Expose()
  @Type(() => Customer)
  public customer?: Customer;

  @Expose()
  @Type(() => Transaction)
  public latestTransaction?: Transaction;

  @Expose()
  public principalAmount: number;

  @Expose()
  public interestAmount: number;
}
