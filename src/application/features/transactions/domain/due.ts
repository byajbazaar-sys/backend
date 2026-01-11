import { Expose, Transform, Type } from 'class-transformer';
import { EDueType } from '../../../shared';
import { Customer } from '../../customers';
import { Transaction } from './transaction';
import { Types } from 'mongoose';

export class Due {
  @Expose()
  public _id?: Types.ObjectId;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  public id?: string;

  @Expose()
  public type: EDueType;

  @Expose()
  @Type(() => Date)
  public dueDate: Date;

  @Expose()
  @Transform(({ obj }) => obj?.loanId?.toString())
  public loanId: string;

  @Expose()
  public dueAmount: number;

  @Expose()
  @Transform(({ obj }) => obj?.customerId?.toString())
  public customerId?: string;

  @Expose()
  @Transform(({ obj }) => obj?.createdBy?.toString())
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
