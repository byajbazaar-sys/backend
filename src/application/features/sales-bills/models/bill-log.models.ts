import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { CLIENT_BILL_LOG_ACTIONS, EBillLogAction } from '../enums/e-bill-log-action.enum';

export class BillLogChangeResponseModel {
  @Expose() @ApiProperty({ example: 'discount' }) field: string;
  @Expose() @ApiProperty({ example: 'Discount' }) label: string;
  @Expose() @ApiPropertyOptional({ nullable: true, example: 0 }) from: string | number | null;
  @Expose() @ApiPropertyOptional({ nullable: true, example: 500 }) to: string | number | null;
}

export class BillLogResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiPropertyOptional({ nullable: true }) billId: string | null;
  @Expose() @ApiProperty() billNumber: string;
  @Expose() @ApiProperty({ enum: EBillLogAction }) action: EBillLogAction;

  @Expose()
  @ApiProperty({ type: [BillLogChangeResponseModel] })
  @Type(() => BillLogChangeResponseModel)
  changes: BillLogChangeResponseModel[];

  @Expose()
  @ApiPropertyOptional({ nullable: true, description: 'Copy of the bill (on create and delete)' })
  snapshot?: Record<string, unknown> | null;

  @Expose() @ApiPropertyOptional({ nullable: true, example: 'mobile' }) channel?: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true }) performedByName?: string | null;
  @Expose() @ApiProperty() @Type(() => Date) createdAt: Date;
}

export class BillLogsPagedResponseModel {
  @Expose()
  @Type(() => BillLogResponseModel)
  @ApiProperty({ type: [BillLogResponseModel] })
  items: BillLogResponseModel[];

  @Expose() @Type(() => Number) @ApiProperty() page: number;
  @Expose() @Type(() => Number) @ApiProperty() perPage: number;
  @Expose() @Type(() => Number) @ApiProperty() totalPages: number;
  @Expose() @Type(() => Number) @ApiProperty() totalCount: number;
  @Expose() @ApiProperty() hasNextPage: boolean;
  @Expose() @ApiProperty() hasPreviousPage: boolean;
}

export class ListBillLogsQueryModel {
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

  @ApiPropertyOptional({ enum: EBillLogAction })
  @IsOptional()
  @IsString()
  action?: string;
}

export class RecordBillLogRequestModel {
  @ApiProperty({ enum: CLIENT_BILL_LOG_ACTIONS })
  @IsIn(CLIENT_BILL_LOG_ACTIONS as unknown as string[])
  action: (typeof CLIENT_BILL_LOG_ACTIONS)[number];
}
