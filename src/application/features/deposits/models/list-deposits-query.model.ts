import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { EDepositStatus } from '../enums';

export class ListDepositsQueryModel {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: EDepositStatus })
  @IsOptional()
  @IsEnum(EDepositStatus)
  status?: EDepositStatus;

  @ApiPropertyOptional({ description: 'Search by customer name, mobile, or deposit ID' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ESortOrder, default: ESortOrder.DESC })
  @IsOptional()
  @IsEnum(ESortOrder)
  sortOrder?: ESortOrder = ESortOrder.DESC;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortField?: string = 'createdAt';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;
}
