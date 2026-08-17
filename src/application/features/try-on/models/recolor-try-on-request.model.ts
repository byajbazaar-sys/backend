import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsString, Matches, MinLength, ValidateNested } from 'class-validator';

import { TRY_ON_COLOR_PATTERN } from './try-on-image.constants';
import { TryOnImageModel } from './try-on-image.model';

export class RecolorTryOnRequestModel {
  @Expose()
  @ApiProperty({ type: TryOnImageModel })
  @ValidateNested()
  @Type(() => TryOnImageModel)
  image!: TryOnImageModel;

  @Expose()
  @ApiProperty({ example: '#C9A227' })
  @IsString()
  @MinLength(2)
  @Matches(TRY_ON_COLOR_PATTERN, { message: 'invalid color' })
  color!: string;
}
