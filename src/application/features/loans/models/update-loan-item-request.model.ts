import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';

export class UpdateLoanItemRequestModel {
  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Item amount', example: 50000 })
  @IsNumber()
  @IsOptional()
  @Min(0.001)
  amount?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Item name', example: 'Gold Necklace' })
  @IsString()
  @IsOptional()
  itemName?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Item description', example: '22K gold necklace with intricate design' })
  @IsString()
  @IsOptional()
  itemDescription?: string;

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
  currentRate?: number;

  @Expose()
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    required: false,
    description: 'Loan item image (JPEG, PNG, WebP) - maximum 5MB',
  })
  image?: Express.Multer.File[];
}
