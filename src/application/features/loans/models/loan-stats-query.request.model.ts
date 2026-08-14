import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';

export class LoanStatsQueryRequestModel {
  @Expose()
  @ApiProperty({ type: Date, example: '2025-01-01' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @Expose()
  @ApiProperty({ type: Date, example: '2025-12-31' })
  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @Expose()
  @ApiPropertyOptional({ example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', required: false })
  @IsOptional()
  @IsUUID()
  itemId?: string;
}
