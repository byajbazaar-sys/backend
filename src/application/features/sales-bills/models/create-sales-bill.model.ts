import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

import { EPaymentMode, EBillStatus, EDocumentType } from '../enums';
import { CreateSalesBillLineItemModel } from './create-sales-bill-line-item.model';

export class CreateSalesBillRequestModel {
  @ApiPropertyOptional({ enum: EDocumentType, default: EDocumentType.NormalBill })
  @IsOptional()
  @IsEnum(EDocumentType)
  documentType?: EDocumentType;

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
  @IsUUID()
  customerId?: string;

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
  goldRate24k?: number;

  @ApiPropertyOptional({ description: 'Per-gram metal rates used for this bill, keyed by metal/purity' })
  @IsOptional()
  metalRates?: Record<string, number>;

  @ApiPropertyOptional({ enum: EPaymentMode })
  @IsOptional()
  @IsEnum(EPaymentMode)
  paymentMode?: EPaymentMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional({ description: 'Cash/UPI/card amount received at checkout (partial payment)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountReceived?: number;

  @ApiPropertyOptional({ description: 'Customer deposit balance applied to this bill' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositApplied?: number;

  @ApiPropertyOptional({ enum: EBillStatus })
  @IsOptional()
  @IsEnum(EBillStatus)
  status?: EBillStatus;

  @ApiProperty({ type: [CreateSalesBillLineItemModel] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesBillLineItemModel)
  items: CreateSalesBillLineItemModel[];
}
