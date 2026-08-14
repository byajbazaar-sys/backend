import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

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
