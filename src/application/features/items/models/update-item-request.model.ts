import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, IsOptional } from 'class-validator';

export class UpdateItemRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Item name', example: 'Gold' })
  @IsString()
  @IsOptional()
  name?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Item description', example: 'Pure gold item' })
  @IsString()
  @IsOptional()
  description?: string;
}
