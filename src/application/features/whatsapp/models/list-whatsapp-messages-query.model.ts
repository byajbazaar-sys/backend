import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import {
  EWhatsAppMessageContextType,
  EWhatsAppMessageDeliveryStatus,
} from '../enums';

export class ListWhatsAppMessagesQueryModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiPropertyOptional({ default: 1 })
  @Expose()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Expose()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by recipient phone digits' })
  @Expose()
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({ enum: EWhatsAppMessageDeliveryStatus })
  @Expose()
  @IsOptional()
  @IsEnum(EWhatsAppMessageDeliveryStatus)
  deliveryStatus?: EWhatsAppMessageDeliveryStatus;

  @ApiPropertyOptional({ enum: EWhatsAppMessageContextType })
  @Expose()
  @IsOptional()
  @IsEnum(EWhatsAppMessageContextType)
  contextType?: EWhatsAppMessageContextType;
}
