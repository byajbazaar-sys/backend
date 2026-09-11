import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class NotifyOrderRequestModel {
  @ApiPropertyOptional({ description: 'Optional extra message appended after the template' })
  @IsOptional()
  @IsString()
  note?: string;
}
