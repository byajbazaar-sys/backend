import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

export class NotificationsFilterOptions {
  @Expose()
  public channel?: string;

  @Expose()
  public status?: string;

  @Expose()
  public recipient?: string;

  @Expose()
  public pageNumber: number;

  @Expose()
  public pageSize: number;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;

  @Expose()
  public createdBy?: string;
}
