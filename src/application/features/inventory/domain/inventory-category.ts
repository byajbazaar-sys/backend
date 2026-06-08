import { Expose } from 'class-transformer';

export class InventoryCategory {
  @Expose()
  id?: string;

  @Expose()
  name: string;

  @Expose()
  description?: string;

  @Expose()
  isSystem?: boolean;

  @Expose()
  createdBy?: string;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
