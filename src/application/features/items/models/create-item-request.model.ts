import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

export class CreateItemRequestModel {
  @Expose()
  @ApiProperty({ description: 'Item name', example: 'Gold' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Item description', example: 'Pure gold item' })
  @IsString()
  @IsOptional()
  description?: string;
}
