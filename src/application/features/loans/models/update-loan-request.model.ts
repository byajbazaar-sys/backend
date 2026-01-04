import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsMongoId, Min } from 'class-validator';
import { Expose } from 'class-transformer';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType } from '../enums';

export class UpdateLoanRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Customer ID', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @Expose()
  @ApiPropertyOptional({ enum: ELoanTenureType, example: ELoanTenureType.MONTHS, description: 'Tenure type' })
  @IsEnum(ELoanTenureType)
  @IsOptional()
  tenureType?: ELoanTenureType;

  @Expose()
  @ApiPropertyOptional({ description: 'Tenure value', example: 12 })
  @IsNumber()
  @IsOptional()
  @Min(1)
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
  @ApiPropertyOptional({ description: 'Interest percentage', example: 12.5 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  interestPercentage?: number;

  @Expose()
  @ApiPropertyOptional({ enum: EInterestType, example: EInterestType.MONTHLY, description: 'Interest type' })
  @IsEnum(EInterestType)
  @IsOptional()
  interestType?: EInterestType;
}
