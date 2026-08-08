import { Expose, Type } from 'class-transformer';

export class JewelleryEventRelatedQuery {
  @Expose()
  excludeId: string;

  @Expose()
  city?: string;

  @Expose()
  state?: string;

  @Expose()
  @Type(() => Number)
  limit?: number;
}
