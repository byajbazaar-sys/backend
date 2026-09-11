import { Expose, Type } from 'class-transformer';

export class OrderAttachment {
  @Expose()
  id?: string;

  @Expose()
  orderId?: string;

  @Expose()
  storageKey?: string;

  @Expose()
  filename?: string;

  @Expose()
  mimeType?: string;

  @Expose()
  url?: string;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}
