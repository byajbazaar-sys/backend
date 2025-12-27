import { ApiProperty } from '@nestjs/swagger';

import { MetaModel } from './internal-models';
import { UserResponseModel } from './user-response.model';

export class PaginatedUserResponseModel {
  @ApiProperty({ type: [UserResponseModel] })
  items: UserResponseModel[];

  @ApiProperty({ type: MetaModel })
  meta: MetaModel;
}
