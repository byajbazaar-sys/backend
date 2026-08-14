import { Expose } from 'class-transformer';

import { EMetalType } from '../../inventory/enums';

export class MetalRate {
  @Expose()
  id?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  metalType: EMetalType;

  @Expose()
  purity: string;

  @Expose()
  rate: number;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;
}
