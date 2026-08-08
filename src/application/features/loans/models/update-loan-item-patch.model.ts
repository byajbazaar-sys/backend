import { Expose, Type } from 'class-transformer';

export class UpdateLoanItemPatch {
  @Expose()
  itemId?: string;

  @Expose()
  itemName?: string;

  @Expose()
  @Type(() => Number)
  amount?: number;

  @Expose()
  @Type(() => Number)
  netWeightInGrams?: number;

  @Expose()
  @Type(() => Number)
  grossWeightInGrams?: number;

  @Expose()
  @Type(() => Number)
  currentRate?: number;

  @Expose()
  imageRef?: string | null;

  @Expose()
  createdBy?: string;
}
