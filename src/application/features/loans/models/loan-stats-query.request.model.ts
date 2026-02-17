import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';
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
  @ApiProperty({ example: '507f1f77bcf86cd799439011', required: false })
  @IsMongoId()
  @IsOptional()
  itemId: string;
}
