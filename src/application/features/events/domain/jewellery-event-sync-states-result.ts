import { Expose } from 'class-transformer';

export class JewelleryEventSyncStatesResult {
  @Expose()
  states: string[];

  @Expose()
  upserted: number;
}
