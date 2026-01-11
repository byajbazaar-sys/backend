import { Expose } from 'class-transformer';
import { ELoanItemType } from '../enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
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
  @ApiProperty({ enum: ELoanItemType, example: ELoanItemType.GOLD })
  @IsEnum(ELoanItemType)
  itemType: ELoanItemType;
}
