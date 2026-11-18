import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class PublicCatalogCategoryFacetModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  count: number;
}
