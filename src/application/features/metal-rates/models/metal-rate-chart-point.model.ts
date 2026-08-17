import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

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
