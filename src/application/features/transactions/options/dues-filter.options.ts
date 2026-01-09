import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';
import { EDueType } from '../../../shared';

export class DuesFilterOptions {
  @Expose()
  public loanIds?: string[];

  @Expose()
  public pageNumber: number;

  @Expose()
  public pageSize: number;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;

  @Expose()
  public createdBy: string;

  @Expose()
  public type?: EDueType[];
}
