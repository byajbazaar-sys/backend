import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESortOrder } from '@shared-libs';
import { Expose, Transform } from 'class-transformer';
import { IsArray, IsOptional, IsMongoId, IsEnum } from 'class-validator';
import { EDueType } from '../../../shared';

export class ListDuesQueryRequestModel {
  @Expose()
  @ApiPropertyOptional({ example: 10, description: 'Number of items per page', required: false })
  pageSize: number;

  @Expose()
  @ApiPropertyOptional({ example: 0, description: 'Page number (0-based)', required: false })
  pageNumber: number;

  @Expose()
  @ApiPropertyOptional({ enum: ESortOrder, example: ESortOrder.DESC, description: 'Sort order', required: false })
  sortOrder: ESortOrder;

  @Expose()
  @ApiPropertyOptional({ example: 'dueDate', description: 'Field to sort by', required: false })
  sortField: string;

  @Expose()
  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011', description: 'Filter by loan ID', required: false })
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
}
