import { ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_PAGE_NUMBER, DEFAULT_PAGE_SIZE } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { EJewelleryEventStatus } from '../domain';

export class ListJewelleryEventsQueryModel {
  @Expose()
  @ApiPropertyOptional({ default: DEFAULT_PAGE_NUMBER })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number = DEFAULT_PAGE_NUMBER;

  @Expose()
  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @Expose()
  @ApiPropertyOptional({ enum: EJewelleryEventStatus })
  @IsOptional()
  @IsEnum(EJewelleryEventStatus)
  status?: EJewelleryEventStatus;

  @Expose()
  @ApiPropertyOptional({ description: 'Search name / city / venue' })
  @IsOptional()
  @IsString()
  search?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'When true, only featured events' })
  @IsOptional()
  @IsString()
  featured?: string;
}
