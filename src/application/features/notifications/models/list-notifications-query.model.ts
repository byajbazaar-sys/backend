import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { ENotificationChannel, ENotificationStatus } from '@shared-libs';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';

export class ListNotificationsQueryModel {
  @ApiPropertyOptional({ enum: ENotificationChannel })
  @IsOptional()
  @IsEnum(ENotificationChannel)
  channel?: ENotificationChannel;

  @ApiPropertyOptional({ enum: ENotificationStatus })
  @IsOptional()
  @IsEnum(ENotificationStatus)
  status?: ENotificationStatus;

  @ApiPropertyOptional({ description: 'Filter by recipient' })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @ApiPropertyOptional({ enum: ESortOrder, default: ESortOrder.DESC })
  @IsOptional()
  @IsEnum(ESortOrder)
  sortOrder?: ESortOrder = ESortOrder.DESC;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortField?: string = 'createdAt';
}
