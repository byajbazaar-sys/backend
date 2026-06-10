import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { EPaymentMode, EBillStatus } from '../enums';

export class CreateSalesBillLineItemModel {
  @ApiPropertyOptional({ description: 'Inventory item UUID when linked to stock' })
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @ApiProperty()
  @IsString()
  itemName: string;

  @ApiProperty()
  @IsString()
  sku: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  grossWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  netWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  makingCharges?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateSalesBillRequestModel {
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
