import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ItemResponseModel {
  @Expose()
  @ApiProperty({ description: 'Item ID', example: '507f1f77bcf86cd799439011' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Item name', example: 'Gold' })
  name: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Item description', example: 'Pure gold item' })
  description?: string;

  @Expose()
  @ApiProperty({ description: 'Created by user ID', example: '507f1f77bcf86cd799439011' })
  createdBy?: string;

  @Expose()
  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt: Date;
}
