import { Expose } from 'class-transformer';

export class JewelleryEventSlugRef {
  @Expose()
  slug: string;

  @Expose()
  updatedAt: Date;
}
