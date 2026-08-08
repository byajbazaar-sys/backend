import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, Min, Max, IsUUID, IsDateString } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType, EInterestPrincipalBasis } from '../enums';
import { INTEREST_PERCENTAGE_MAX, TENURE_MAX } from '@shared-libs';

export class UpdateLoanRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Customer ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @IsString()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Loan start / issue date (ISO date or datetime)',
    example: '2026-01-15',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Expose()
  @ApiPropertyOptional({ enum: ELoanTenureType, example: ELoanTenureType.MONTHS, description: 'Tenure type' })
  @IsEnum(ELoanTenureType)
  @IsOptional()
  tenureType?: ELoanTenureType;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Tenure value', example: 12 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(TENURE_MAX)
  tenureValue?: number;

  @Expose()
  @ApiPropertyOptional({
    enum: EInterestCalculationMethod,
    example: EInterestCalculationMethod.SIMPLE,
    description: 'Interest calculation method',
  })
  @IsEnum(EInterestCalculationMethod)
  @IsOptional()
  interestCalculationMethod?: EInterestCalculationMethod;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Interest percentage', example: 12.5 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(INTEREST_PERCENTAGE_MAX)
  interestPercentage?: number;

  @Expose()
  @ApiPropertyOptional({ enum: EInterestType, example: EInterestType.MONTHLY, description: 'Interest type' })
  @IsEnum(EInterestType)
  @IsOptional()
  interestType?: EInterestType;

  @Expose()
  @ApiPropertyOptional({
    enum: EInterestPrincipalBasis,
    example: EInterestPrincipalBasis.REMAINING,
    description:
      'When paid dues exist, whether to recalculate interest on remaining principal or total (original) principal',
  })
  @IsEnum(EInterestPrincipalBasis)
  @IsOptional()
  interestPrincipalBasis?: EInterestPrincipalBasis;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({
    description:
      'Loan version this edit was based on. When sent, the update is rejected with 409 if the loan changed since it was read.',
    example: 3,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  version?: number;
}
