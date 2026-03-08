import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsDate } from 'class-validator';
import { ESortOrder } from '@shared-libs';
import { ExportFormat } from '../../../shared';
import { ELoanStatus } from '../enums';

export class DownloadLoansQueryRequestModel {
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
  sortOrder?: ESortOrder;

  @Expose()
  @ApiPropertyOptional({ example: 'createdAt', description: 'Field to sort by', required: false })
  @IsOptional()
  sortField?: string;

  @Expose()
  @ApiPropertyOptional({
    example: '507f1f77bcf86cd799439011',
    description: 'Filter by customer ID',
    required: false,
  })
  @IsOptional()
  customerId?: string;

  @Expose()
  @ApiPropertyOptional({
    enum: ELoanStatus,
    example: ELoanStatus.OPEN,
    description: 'Filter by loan status (defaults to OPEN if not specified)',
    required: false,
  })
  @IsOptional()
  @IsEnum(ELoanStatus)
  status?: ELoanStatus;

  @Expose()
  @ApiPropertyOptional({ type: Date, example: '2025-01-01', description: 'Filter loans created on or after this date', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @Expose()
  @ApiPropertyOptional({ type: Date, example: '2025-12-31', description: 'Filter loans created on or before this date', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
