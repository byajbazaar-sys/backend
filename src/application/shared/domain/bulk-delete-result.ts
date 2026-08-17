import { Expose } from 'class-transformer';

export class BulkDeleteResult {
  @Expose()
  deletedCount: number;
}
