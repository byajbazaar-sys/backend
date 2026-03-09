import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class LoanStatsResponseModel {
  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 4 })
  total: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 1 })
  closed: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 3 })
  open: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 19000 })
  interestRemaining: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 0 })
  interestPaid: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 200000 })
  amountRemaining: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 0 })
  amountPaid: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 0 })
  customersCount: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 0 })
  totalItems: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 0 })
  totalNetWeight: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty({ example: 0 })
  totalGrossWeight: number;
}
