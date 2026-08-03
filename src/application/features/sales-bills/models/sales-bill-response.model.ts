import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EBillStatus, EPaymentMode, EDocumentType } from '../enums';
import { SalesBillLineItemResponseModel } from './sales-bill-line-item-response.model';

export class SalesBillResponseModel {
  @Expose()
  @ApiPropertyOptional()
  id?: string;

  @Expose()
  @ApiProperty()
  billNumber: string;

  @Expose()
  @ApiProperty({ enum: EDocumentType })
  documentType: EDocumentType;

  @Expose()
  @ApiProperty()
  customerName: string;

  @Expose()
  @ApiPropertyOptional()
  customerMobile?: string;

  @Expose()
  @ApiPropertyOptional()
  customerId?: string;

  @Expose()
  @ApiPropertyOptional()
  customerAddress?: string;

  @Expose()
  @ApiPropertyOptional()
  customerState?: string;

  @Expose()
  @ApiPropertyOptional()
  customerStateCode?: string;

  @Expose()
  @ApiPropertyOptional()
  customerGstin?: string;

  @Expose()
  @ApiPropertyOptional()
  customerPan?: string;

  @Expose()
  @ApiPropertyOptional()
  customerPropName?: string;

  @Expose()
  @ApiProperty()
  subtotal: number;

  @Expose()
  @ApiProperty()
  discount: number;

  @Expose()
  @ApiProperty()
  taxAmount: number;

  @Expose()
  @ApiPropertyOptional()
  cgstRate?: number;

  @Expose()
  @ApiPropertyOptional()
  sgstRate?: number;

  @Expose()
  @ApiPropertyOptional()
  cgstAmount?: number;

  @Expose()
  @ApiPropertyOptional()
  sgstAmount?: number;

  @Expose()
  @ApiPropertyOptional()
  roundOff?: number;

  @Expose()
  @ApiPropertyOptional()
  goldRate24k?: number;

  @Expose()
  @ApiPropertyOptional()
  metalRates?: Record<string, number>;

  @Expose()
  @ApiProperty()
  grandTotal: number;

  @Expose()
  @ApiPropertyOptional()
  amountReceived?: number;

  @Expose()
  @ApiPropertyOptional()
  depositApplied?: number;

  @Expose()
  @ApiPropertyOptional()
  totalPurchaseCost?: number;

  @Expose()
  @ApiPropertyOptional()
  totalProfit?: number;

  @Expose()
  @ApiProperty({ enum: EPaymentMode })
  paymentMode: EPaymentMode;

  @Expose()
  @ApiProperty({ enum: EBillStatus })
  status: EBillStatus;

  @Expose()
  @ApiProperty()
  issuedAt: Date;

  @Expose()
  @Type(() => SalesBillLineItemResponseModel)
  @ApiPropertyOptional({ type: [SalesBillLineItemResponseModel] })
  items?: SalesBillLineItemResponseModel[];

  @Expose()
  @ApiPropertyOptional()
  createdAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  updatedAt?: Date;
}
