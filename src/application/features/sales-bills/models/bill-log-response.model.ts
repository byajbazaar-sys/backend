import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { BillLogChangeResponseModel } from './bill-log-change-response.model';
import { EBillLogAction } from '../enums';

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
