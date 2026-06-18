import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { EPaymentMode, EBillStatus, EDocumentType } from '../enums';

export class ListSalesBillsQueryModel {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pageNumber?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: 'Search bill number, customer name, or mobile' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: EPaymentMode })
  @IsOptional()
  @IsEnum(EPaymentMode)
  paymentMode?: EPaymentMode;

  @ApiPropertyOptional({ enum: EBillStatus })
  @IsOptional()
  @IsEnum(EBillStatus)
  status?: EBillStatus;

  @ApiPropertyOptional({ enum: EDocumentType })
  @IsOptional()
  @IsEnum(EDocumentType)
  documentType?: EDocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'grandTotal'] })
  @IsOptional()
  @IsString()
  sortField?: 'createdAt' | 'grandTotal';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
