import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EOrderPriority, EOrderStatus, EOrderType } from '../enums';
import { OrderAttachmentResponseModel } from './order-attachment-response.model';

export class OrderResponseModel {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  orderNumber: string;

  @Expose()
  @ApiProperty()
  customerId: string;

  @Expose()
  @ApiPropertyOptional()
  customerFirstName?: string;

  @Expose()
  @ApiPropertyOptional()
  customerLastName?: string;

  @Expose()
  @ApiPropertyOptional()
  customerPhone?: string;

  @Expose()
  @ApiPropertyOptional()
  assignedTo?: string;

  @Expose()
  @ApiPropertyOptional()
  assignedToFirstName?: string;

  @Expose()
  @ApiPropertyOptional()
  assignedToLastName?: string;

  @Expose()
  @ApiProperty({ enum: EOrderType })
  orderType: EOrderType;

  @Expose()
  @ApiProperty({ enum: EOrderStatus })
  status: EOrderStatus;

  @Expose()
  @ApiProperty({ enum: EOrderPriority })
  priority: EOrderPriority;

  @Expose()
  @ApiPropertyOptional()
  title?: string;

  @Expose()
  @ApiPropertyOptional()
  description?: string;

  @Expose()
  @Type(() => Date)
  @ApiPropertyOptional()
  dueDate?: Date;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  estimatedAmount: number;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional()
  finalAmount?: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalAmount: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  paidAmount: number;

  @Expose()
  @Type(() => OrderAttachmentResponseModel)
  @ApiPropertyOptional({ type: [OrderAttachmentResponseModel] })
  attachments?: OrderAttachmentResponseModel[];

  @Expose()
  @ApiPropertyOptional()
  notes?: string;

  @Expose()
  @ApiProperty()
  isOverdue: boolean;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty()
  updatedAt: Date;
}
