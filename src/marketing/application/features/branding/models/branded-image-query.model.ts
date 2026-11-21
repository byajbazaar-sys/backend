import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** A finished library photo, exported with (or without) the shop logo. */
export class BrandedImageQueryModel {
  @ApiProperty({ enum: ['campaign', 'photoshoot'] })
  @IsIn(['campaign', 'photoshoot'])
  sourceType: 'campaign' | 'photoshoot';

  @ApiProperty()
  @IsUUID()
  sourceId: string;

  @ApiProperty({ minimum: 0, maximum: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  sourceIndex: number;

  @ApiPropertyOptional({ description: "Override the owner's logo switch" })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true ? true : value === 'false' || value === false ? false : value,
  )
  @IsBoolean()
  logo?: boolean;
}

export class UpdateBrandSettingsRequestModel {
  @ApiProperty({ description: 'Put the shop logo on exported photos' })
  @IsBoolean()
  logoOverlay: boolean;
}
