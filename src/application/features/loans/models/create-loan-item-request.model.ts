import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, IsUUID } from 'class-validator';
import { Expose, Transform } from 'class-transformer';

export class CreateLoanItemRequestModel {
  @Expose()
  @Transform(({ obj }) => obj.item_id ?? obj.itemId)
  @ApiProperty({ description: 'Item ID (UUID)', example: 'fc3acf14-8313-44f3-998e-bc67afc1b465' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  itemId: string;

  @Expose()
  @ApiProperty({ description: 'Item amount', example: 50000 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  amount: number;

  @Expose()
  @ApiProperty({ description: 'Item name', example: 'Gold Necklace' })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Item description', example: '22K gold necklace with intricate design' })
  @IsString()
  @IsOptional()
  itemDescription?: string;

  @Expose()
  @ApiProperty({ description: 'Net weight in grams', example: 50.5 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  netWeightInGrams: number;

  @Expose()
  @ApiProperty({ description: 'Gross weight in grams', example: 55.2 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  grossWeightInGrams: number;

  @Expose()
  @ApiProperty({ description: 'Current rate of item', example: 5000 })
  @IsNumber()
  @IsNotEmpty()
  @IsOptional()
  @Min(0.001)
  currentRate?: number;
}
