import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { DepositResponseModel } from './deposit-response.model';

class DepositsPagedMetaModel {
  @Expose()
  @ApiProperty()
  page: number;

  @Expose()
  @ApiProperty()
  limit: number;

  @Expose()
  @ApiProperty()
  totalItems: number;

  @Expose()
  @ApiProperty()
  totalPages: number;
}

export class DepositsPagedResponseModel {
  @Expose()
  @Type(() => DepositResponseModel)
  @ApiProperty({ type: [DepositResponseModel] })
  items: DepositResponseModel[];

  @Expose()
  @Type(() => DepositsPagedMetaModel)
  @ApiProperty()
  meta: DepositsPagedMetaModel;
}
