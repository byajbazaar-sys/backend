import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

import { EBillStatus, EPaymentMode } from '../enums';
import { UpdateSalesBillLineItemModel } from './update-sales-bill-line-item.model';

export class UpdateSalesBillRequestModel {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerMobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerStateCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerGstin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPropName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ enum: EPaymentMode })
  @IsOptional()
  @IsEnum(EPaymentMode)
  paymentMode?: EPaymentMode;

  @ApiPropertyOptional({ enum: EBillStatus })
  @IsOptional()
  @IsEnum(EBillStatus)
  status?: EBillStatus;

  @ApiPropertyOptional({ description: 'Bill issue date (ISO date or datetime)' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ type: [UpdateSalesBillLineItemModel] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSalesBillLineItemModel)
  items?: UpdateSalesBillLineItemModel[];
}
