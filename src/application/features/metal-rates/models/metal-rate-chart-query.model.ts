import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class MetalRateChartQueryModel {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  endDate?: string;
}
