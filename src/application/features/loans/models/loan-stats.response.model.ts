import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class LoanStatsResponseModel {
  @Expose()
  @ApiProperty({ example: 4 })
  total: number;

  @Expose()
  @ApiProperty({ example: 1 })
  closed: number;

  @Expose()
  @ApiProperty({ example: 3 })
  open: number;

  @Expose()
  @ApiProperty({ example: 19000 })
  interestRemaining: number;

  @Expose()
  @ApiProperty({ example: 0 })
  interestPaid: number;

  @Expose()
  @ApiProperty({ example: 200000 })
  amountRemaining: number;

  @Expose()
  @ApiProperty({ example: 0 })
  amountPaid: number;

  @Expose()
  @ApiProperty({ example: 0 })
  customersCount: number;

  @Expose()
  @ApiProperty({ example: 0 })
  totalItems: number;

  @Expose()
  @ApiProperty({ example: 0 })
  totalNetWeight: number;

  @Expose()
  @ApiProperty({ example: 0 })
  totalGrossWeight: number;
}
