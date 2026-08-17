import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { TRY_ON_JEWELLERY_TYPES, type TryOnJewelleryType } from '../jewellery-types';
import { TryOnImageModel } from './try-on-image.model';

export class TryOnJewelleryItemModel extends TryOnImageModel {
  @Expose()
  @ApiProperty({ enum: TRY_ON_JEWELLERY_TYPES })
  @IsIn([...TRY_ON_JEWELLERY_TYPES])
  type!: TryOnJewelleryType;

  @Expose()
  @ApiPropertyOptional({ description: 'Physical height in inches for proportion lock' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(24)
  heightInInches?: number;
}
