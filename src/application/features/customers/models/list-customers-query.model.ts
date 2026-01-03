import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, IsEnum } from 'class-validator';
import { Expose, Type } from 'class-transformer';

export class ListCustomersQueryModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Page number', example: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageNumber?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Page size', example: 10, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Field to sort by', example: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @Expose()
  @ApiPropertyOptional({ description: 'Search term for name or email', example: 'john' })
  @IsOptional()
  @IsString()
  search?: string;
}
