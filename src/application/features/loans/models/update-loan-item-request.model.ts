import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, Max, IsUUID } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { AMOUNT_MAX, RATE_MAX } from '@shared-libs';

export class UpdateLoanItemRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Item ID', example: 'fc3acf14-8313-44f3-998e-bc67afc1b465' })
  @IsString()
  @IsOptional()
  @IsUUID()
  itemId: string;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Item amount', example: 50000 })
  @IsNumber()
  @IsOptional()
  @Min(0.001)
  @Max(AMOUNT_MAX)
  amount?: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Net weight in grams', example: 50.5 })
  @IsNumber()
  @IsOptional()
  @Min(0.001)
  netWeightInGrams?: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Gross weight in grams', example: 55.2 })
  @IsNumber()
  @IsOptional()
  @Min(0.001)
  grossWeightInGrams?: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Current rate of item', example: 5000 })
  @IsNumber()
  @IsOptional()
  @Min(0.001)
  @Max(RATE_MAX)
  currentRate?: number;

  @Expose()
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    required: false,
    description: 'Loan item image (JPEG, PNG, WebP) - maximum 5MB',
  })
  @IsOptional()
  image?: Express.Multer.File[];
}
