import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { EMetalType } from '../../inventory';

export class MetalRateEntryResponseModel {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: EMetalType })
  @Expose()
  metalType: EMetalType;

  @ApiProperty()
  @Expose()
  purity: string;

  @ApiProperty()
  @Expose()
  rate: number;

  @ApiProperty()
  @Expose()
  createdAt: string;

  @ApiProperty()
  @Expose()
  updatedAt: string;
}
