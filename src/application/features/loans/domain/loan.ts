import { Expose, Type } from 'class-transformer';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType, ELoanStatus } from '../enums';
import { LoanItem } from './loan-item';

export class Loan {
  @Expose()
  public id: string;

  @Expose()
  public createdBy: string;

  @Expose()
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

  @Expose()
  public amountPaid: number;

  @Expose()
  public amountRemaining: number;

  @Expose()
  public interestPaid: number;

  @Expose()
  public interestRemaining: number;

  @Expose()
  public status: ELoanStatus;
}
