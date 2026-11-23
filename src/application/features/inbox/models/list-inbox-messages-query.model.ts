import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListInboxMessagesQueryModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Only messages older than this (ISO date) — the next page up' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  before?: Date;

  @Expose()
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
