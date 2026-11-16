import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

import { EActivityLogCategory } from '../../../application/shared/services/i-activity-logger';

export class ActivityLogResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty({ enum: EActivityLogCategory }) category: EActivityLogCategory;
  @Expose() @ApiProperty({ example: 'REMINDER_SENT' }) action: string;
  @Expose() @ApiProperty({ example: 'due' }) entityType: string;
  @Expose() @ApiPropertyOptional({ nullable: true }) entityId: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true, description: 'The shop the entry belongs to' }) userId:
    | string
    | null;
  @Expose() @ApiPropertyOptional({ nullable: true }) performedBy: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true }) performedByName: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true, example: 'web' }) channel: string | null;
  @Expose() @ApiProperty({ type: Object }) data: Record<string, unknown>;
  @Expose() @ApiProperty() @Type(() => Date) createdAt: Date;
}

export class ActivityLogsPagedResponseModel {
  @Expose()
  @Type(() => ActivityLogResponseModel)
  @ApiProperty({ type: [ActivityLogResponseModel] })
  items: ActivityLogResponseModel[];

  @Expose() @Type(() => Number) @ApiProperty() page: number;
  @Expose() @Type(() => Number) @ApiProperty() perPage: number;
  @Expose() @Type(() => Number) @ApiProperty() totalPages: number;
  @Expose() @Type(() => Number) @ApiProperty() totalCount: number;
  @Expose() @ApiProperty() hasNextPage: boolean;
  @Expose() @ApiProperty() hasPreviousPage: boolean;
}

export class ListActivityLogsQueryModel {
  @ApiPropertyOptional({ enum: EActivityLogCategory })
  @IsOptional()
  @IsEnum(EActivityLogCategory)
  category?: EActivityLogCategory;

  @ApiPropertyOptional({ example: 'REFUND_CREATED' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @ApiPropertyOptional({ example: 'subscription' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  entityId?: string;

  @ApiPropertyOptional({ description: 'Shop (user) id' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  performedBy?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
