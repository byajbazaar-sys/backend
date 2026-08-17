import { Expose } from 'class-transformer';

export class InventoryCategoryBreakdown {
  @Expose()
  categoryId: string;

  @Expose()
  categoryName: string;

  @Expose()
  count: number;

  @Expose()
  totalValue: number;
}
