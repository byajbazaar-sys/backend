import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ETransactionType, ETransactionPaidIn } from '../enums';
import { Customer } from '../../customers';

export class Transaction {
  @Expose()
  public _id?: Types.ObjectId;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  public id: string;

  @Expose()
  @Transform(({ obj }) => obj?.loanId?.toString())
  public loanId: string;

  @Expose()
  @Transform(({ obj }) => obj?.customerId?.toString())
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
  @Transform(({ obj }) => obj?.createdBy?.toString())
  public createdBy: string;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;

  @Expose()
  @Type(() => Customer)
  public customer: Customer;

  @Expose()
  @Transform(({ obj }) => obj?.dueId?.toString())
  public dueId?: string;
}
