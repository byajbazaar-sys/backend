import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ESortOrder } from '@shared-libs';
import { ExportFormat } from '../../../shared';

export class DownloadCustomersQueryRequestModel {
  @Expose()
  @ApiProperty({
    enum: ExportFormat,
    example: ExportFormat.CSV,
    description: 'Export format (csv or pdf)',
  })
  @IsNotEmpty()
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @Expose()
  @ApiPropertyOptional({ enum: ESortOrder, example: ESortOrder.DESC, description: 'Sort order', required: false })
  @IsOptional()
  @IsEnum(ESortOrder)
  sortOrder?: ESortOrder;

  @Expose()
  @ApiPropertyOptional({ example: 'createdAt', description: 'Field to sort by', required: false })
  @IsOptional()
  @IsString()
  sortField?: string;

  @Expose()
  @ApiPropertyOptional({
    example: 'customer name',
    description: 'Search by customer name (partial match)',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @Expose()
  @ApiPropertyOptional({ type: Date, example: '2025-01-01', description: 'Filter records created on or after this date', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @Expose()
  @ApiPropertyOptional({ type: Date, example: '2025-12-31', description: 'Filter records created on or before this date', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
