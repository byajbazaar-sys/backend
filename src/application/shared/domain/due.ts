import { Expose, Type } from 'class-transformer';
import { Customer, Transaction } from '../../features';
import { EDueType } from '../enums';

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
  @Type(() => Number)
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
  @Type(() => Number)
  public principalAmount: number;

  @Expose()
  @Type(() => Number)
  public interestAmount: number;
}
