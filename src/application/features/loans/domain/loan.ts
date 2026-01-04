import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType } from '../enums';
import { LoanItem } from './loan-item';

export class Loan {
  @Expose()
  public _id?: Types.ObjectId;

  @Expose()
  @Transform(({ obj }) => obj?._id?.toString())
  public id: string;

  @Expose()
  @Transform(({ obj }) => obj?.createdBy?.toString())
  public createdBy: string;

  @Expose()
  @Transform(({ obj }) => obj?.customerId?.toString())
  public customerId: string;

  @Expose()
  public tenureType: ELoanTenureType;

  @Expose()
  public tenureValue: number;

  @Expose()
  public interestCalculationMethod: EInterestCalculationMethod;

  @Expose()
  public interestPercentage: number;

  @Expose()
  public interestType: EInterestType;

  @Expose()
  public createdAt?: Date;

  @Expose()
  public updatedAt?: Date;

  @Expose()
  @Type(() => LoanItem)
  public loanItems?: LoanItem[];
}

