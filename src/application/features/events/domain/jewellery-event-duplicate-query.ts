import { Expose, Type } from 'class-transformer';

export class JewelleryEventDuplicateQuery {
  @Expose()
  name: string;

  @Expose()
  city?: string;

  @Expose()
  @Type(() => Date)
  startDate?: Date | string;
}
