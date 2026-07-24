import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class DepositStatsResponseModel {
  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalDeposits: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  activeAccounts: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalBalance: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  recentTransactionCount: number;
}
