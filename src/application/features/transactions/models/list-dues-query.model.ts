import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Expose, Transform, Type } from 'class-transformer';
import { IsArray, IsOptional, IsMongoId, IsEnum, IsString } from 'class-validator';
import { EDueType } from '../../../shared';

export class ListDuesQueryRequestModel {
  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 10, description: 'Number of items per page', required: false })
  pageSize: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ example: 0, description: 'Page number (0-based)', required: false })
  pageNumber: number;

  @Expose()
  @ApiPropertyOptional({ enum: ESortOrder, example: ESortOrder.DESC, description: 'Sort order', required: false })
  sortOrder: ESortOrder;

  @Expose()
  @ApiPropertyOptional({ example: 'dueDate', description: 'Field to sort by', required: false })
  sortField: string;

  @Expose()
  @ApiPropertyOptional({ example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', description: 'Filter by loan ID', required: false })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  loanIds?: string[];

  @Expose()
  @ApiPropertyOptional({
    isArray: true,
    enum: EDueType,
    example: [EDueType.UPCOMING_DUE, EDueType.PAST_DUE],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(EDueType, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  type?: EDueType[];

  @Expose()
  @ApiPropertyOptional({ example: 'John Doe', description: 'Filter by customer name', required: false })
  @IsOptional()
  @IsString()
  customerName?: string;
}
