import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsEnum, IsMongoId, Min, IsArray } from 'class-validator';
import { Expose, plainToInstance, Transform, Type } from 'class-transformer';
import { ELoanTenureType, EInterestCalculationMethod, EInterestType } from '../enums';
import { CreateLoanItemRequestModel } from './create-loan-item-request.model';

export class CreateLoanRequestModel {
  @Expose()
  @ApiProperty({ description: 'Customer ID', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  customerId: string;

  @Expose()
  @ApiProperty({ enum: ELoanTenureType, example: ELoanTenureType.MONTHS, description: 'Tenure type' })
  @IsEnum(ELoanTenureType)
  @IsNotEmpty()
  tenureType: ELoanTenureType;

  @Expose()
  @ApiProperty({ description: 'Tenure value', example: 12 })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
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
  @ApiProperty({ description: 'Interest percentage', example: 12.5 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
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
  loanItemImages?: Express.Multer.File[];
}
