import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType, ELoanStatus } from '../enums';
import { LoanItemResponseModel } from './loan-item-response.model';

export class LoanResponseModel {
  @Expose()
  @ApiProperty({ description: 'Unique identifier of the loan', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'User ID of the creator', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  createdBy: string;

  @Expose()
  @ApiProperty({ description: 'Customer ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  customerId: string;

  @Expose()
  @ApiProperty({ enum: ELoanTenureType, example: ELoanTenureType.MONTHS, description: 'Tenure type' })
  tenureType: ELoanTenureType;

  @Expose()
  @ApiProperty({ description: 'Tenure value', example: 12 })
  tenureValue: number;

  @Expose()
  @ApiProperty({ enum: EInterestCalculationMethod, example: EInterestCalculationMethod.SIMPLE, description: 'Interest calculation method' })
  interestCalculationMethod: EInterestCalculationMethod;

  @Expose()
  @ApiProperty({ description: 'Interest percentage', example: 12.5 })
  interestPercentage: number;

  @Expose()
  @ApiProperty({ enum: EInterestType, example: EInterestType.MONTHLY, description: 'Interest type' })
  interestType: EInterestType;

  @Expose()
  @ApiProperty({ description: 'Date when the loan was created', type: Date })
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Date when the loan was last updated', type: Date })
  @Type(() => Date)
  updatedAt: Date;

  @Expose()
  @ApiProperty({ description: 'Amount remaining', example: 1000 })
  amountRemaining: number;

  @Expose()
  @ApiProperty({ description: 'Amount paid', example: 1000 })
  amountPaid: number;

  @Expose()
  @ApiProperty({ description: 'Interest paid', example: 100 })
  interestPaid: number;

  @Expose()
  @ApiProperty({ description: 'Interest remaining', example: 100 })
  interestRemaining: number;

  @Expose()
  @ApiProperty({ enum: ELoanStatus, example: ELoanStatus.OPEN, description: 'Loan status' })
  status: ELoanStatus;

  @Expose()
  @ApiProperty({ description: 'Loan items', type: [LoanItemResponseModel] })
  @Type(() => LoanItemResponseModel)
  loanItems?: LoanItemResponseModel[];
}

