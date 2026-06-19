import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class InventoryItemSaleResponseModel {
  @Expose()
  @ApiProperty()
  lineItemId: string;

  @Expose()
  @ApiProperty()
  billId: string;

  @Expose()
  @ApiProperty()
  billNumber: string;

  @Expose()
  @ApiProperty()
  issuedAt: string;

  @Expose()
  @ApiProperty()
  quantity: number;

  @Expose()
  @ApiProperty()
  sellingPrice: number;

  @Expose()
  @ApiProperty()
  lineTotal: number;

  @Expose()
  @ApiProperty()
  purchaseCost: number;

  @Expose()
  @ApiProperty()
  profitAmount: number;
}
