import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max, IsUUID } from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { AMOUNT_MAX, WEIGHT_MAX, RATE_MAX } from '@shared-libs';

export class CreateLoanItemRequestModel {
  @Expose()
  @Transform(({ obj }) => obj.item_id ?? obj.itemId)
  @ApiProperty({ description: 'Item ID (UUID)', example: 'fc3acf14-8313-44f3-998e-bc67afc1b465' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  itemId: string;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Item amount', example: 50000 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  @Max(AMOUNT_MAX)
  amount: number;

  @Expose()
  @ApiProperty({ description: 'Item name', example: 'Gold Necklace' })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Net weight in grams', example: 50.5 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  @Max(WEIGHT_MAX)
  netWeightInGrams: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ description: 'Gross weight in grams', example: 55.2 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  @Max(WEIGHT_MAX)
  grossWeightInGrams: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Current rate of item', example: 5000 })
  @IsNumber()
  @IsOptional()
  @Min(0.001)
  @Max(RATE_MAX)
  currentRate?: number;
}
