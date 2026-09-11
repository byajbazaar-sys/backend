import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { EOrderStatus } from '../enums';

export class UpdateOrderStatusRequestModel {
  @ApiProperty({ enum: EOrderStatus })
  @IsEnum(EOrderStatus)
  @IsNotEmpty()
  status: EOrderStatus;

  @ApiPropertyOptional({ description: 'Optional note for the status change' })
  @IsOptional()
  @IsString()
  note?: string;
}
