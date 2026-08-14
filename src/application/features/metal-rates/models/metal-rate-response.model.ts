import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EMetalType } from '../../inventory/enums';

export class CurrentMetalRatesResponseModel {
  @ApiPropertyOptional({ example: 7200 })
  @Expose()
  gold24?: number;

  @ApiPropertyOptional({ example: 6600 })
  @Expose()
  gold22?: number;

  @ApiPropertyOptional({ example: 6000 })
  @Expose()
  gold20?: number;

  @ApiPropertyOptional({ example: 5400 })
  @Expose()
  gold18?: number;

  @ApiPropertyOptional({ example: 95 })
  @Expose()
  silver999?: number;

  @ApiPropertyOptional({ example: 88 })
  @Expose()
  silver925?: number;

  @ApiPropertyOptional()
  @Expose()
  gold24UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  gold22UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  gold20UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  gold18UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  silver999UpdatedAt?: string;

  @ApiPropertyOptional()
  @Expose()
  silver925UpdatedAt?: string;
}

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

export class MetalRatesPagedResponseModel {
  @ApiProperty({ type: [MetalRateEntryResponseModel] })
  @Expose()
  @Type(() => MetalRateEntryResponseModel)
  items: MetalRateEntryResponseModel[];

  @ApiProperty()
  @Expose()
  totalCount: number;

  @ApiProperty()
  @Expose()
  page: number;

  @ApiProperty()
  @Expose()
  pageSize: number;
}

export class MetalRateChartPointModel {
  @ApiProperty({ example: '2026-06-01' })
  @Expose()
  date: string;

  @ApiPropertyOptional()
  @Expose()
  gold24?: number;

  @ApiPropertyOptional()
  @Expose()
  gold22?: number;

  @ApiPropertyOptional()
  @Expose()
  gold20?: number;

  @ApiPropertyOptional()
  @Expose()
  gold18?: number;

  @ApiPropertyOptional()
  @Expose()
  silver999?: number;

  @ApiPropertyOptional()
  @Expose()
  silver925?: number;
}
