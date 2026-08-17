import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class JewelleryEventSyncStatesResponseModel {
  @Expose()
  @ApiProperty({ type: [String] })
  states!: string[];

  @Expose()
  @ApiProperty()
  upserted!: number;
}
