import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsEnum, Min, Max, IsArray, IsUUID, IsOptional, IsDateString } from 'class-validator';
import { Expose, plainToInstance, Transform, Type } from 'class-transformer';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType } from '../enums';
import { INTEREST_PERCENTAGE_MAX, TENURE_MAX } from '@shared-libs';
import { CreateLoanItemRequestModel } from './create-loan-item-request.model';

export class CreateLoanRequestModel {
  @Expose()
  @ApiProperty({ description: 'Customer ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  customerId: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Loan start / issue date (ISO date or datetime). Defaults to now when omitted.',
    example: '2026-07-14',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Expose()
  @ApiProperty({ enum: ELoanTenureType, example: ELoanTenureType.MONTHS, description: 'Tenure type' })
  @IsEnum(ELoanTenureType)
  @IsNotEmpty()
  tenureType: ELoanTenureType;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Tenure value', example: 12 })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  @Max(TENURE_MAX)
  tenureValue: number;

  @Expose()
  @ApiProperty({
    enum: EInterestCalculationMethod,
    example: EInterestCalculationMethod.SIMPLE,
    description: 'Interest calculation method',
  })
  @IsEnum(EInterestCalculationMethod)
  @IsNotEmpty()
  interestCalculationMethod: EInterestCalculationMethod;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Interest percentage', example: 12.5 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(INTEREST_PERCENTAGE_MAX)
  interestPercentage: number;

  @Expose()
  @ApiProperty({ enum: EInterestType, example: EInterestType.MONTHLY, description: 'Interest type' })
  @IsEnum(EInterestType)
  @IsNotEmpty()
  interestType: EInterestType;

  @Expose()
  @ApiProperty({ description: 'Loan items', type: [CreateLoanItemRequestModel] })
  @IsNotEmpty()
  @Type(() => CreateLoanItemRequestModel)
  loanItems: CreateLoanItemRequestModel[];

  @Expose()
  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    required: false,
    description: 'Loan item images (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  loanItemImages?: Express.Multer.File[];
}
