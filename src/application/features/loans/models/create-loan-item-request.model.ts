import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import { Expose } from 'class-transformer';
import { ELoanItemType } from '../enums';

export class CreateLoanItemRequestModel {
  @Expose()
  @ApiProperty({ enum: ELoanItemType, example: ELoanItemType.GOLD, description: 'Loan item type' })
  @IsEnum(ELoanItemType)
  @IsNotEmpty()
  type: ELoanItemType;

  @Expose()
  @ApiProperty({ description: 'Item amount', example: 50000 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
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
  @Min(0)
  netWeightInGrams: number;

  @Expose()
  @ApiProperty({ description: 'Gross weight in grams', example: 55.2 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  grossWeightInGrams: number;
}
