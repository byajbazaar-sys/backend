import { Expose } from 'class-transformer';

export class JewelleryEventUpsertResult {
  @Expose()
  upserted: number;
}
