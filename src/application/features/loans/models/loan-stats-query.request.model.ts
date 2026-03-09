import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class LoanStatsQueryRequestModel {
  @Expose()
  @ApiProperty({ type: Date, example: '2025-01-01' })
  @Type(() => Date)
  startDate: Date;

  @Expose()
  @ApiProperty({ type: Date, example: '2025-01-01' })
  @Type(() => Date)
  endDate: Date;

  @Expose()
  @ApiProperty({ example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', required: false })
  @IsUUID()
  @IsOptional()
  itemId: string;
}
