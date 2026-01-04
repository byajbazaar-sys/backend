import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType } from '../enums';

export class LoanResponseModel {
  @Expose()
  @ApiProperty({ description: 'Unique identifier of the loan', example: '507f1f77bcf86cd799439011' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'User ID of the creator', example: '507f1f77bcf86cd799439011' })
  createdBy: string;

  @Expose()
  @ApiProperty({ description: 'Customer ID', example: '507f1f77bcf86cd799439011' })
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
}

