import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsDate,
  IsNumber,
} from 'class-validator';
import { Expose, Type } from 'class-transformer';

export class JobRequestModel {
  @Expose()
  @ApiProperty({ description: 'Name of the job', example: 'Job Name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @Expose()
  @ApiProperty({ description: 'Type of the job', example: 'post' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Expiration time in milliseconds',
    example: '1753692599999',
  })
  @IsOptional()
  expiresAt?: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Text content of the job',
    example: 'Hello, this is my first post!',
  })
  @IsString()
  @IsOptional()
  text?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Custom data associated with the job',
    type: 'object',
    example: { customField: 'customValue' },
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  custom?: Record<string, any>;

  @Expose()
  @ApiPropertyOptional({
    description: 'Location information for the job',
    type: String,
  })
  @IsOptional()
  location?: string;

  @Expose()
  @ApiProperty({ description: 'Number of openings for the job', example: 5 })
  @IsNumber()
  @IsOptional()
  numberOfOpenings: number;

  @Expose()
  @ApiProperty({ description: 'Status of the job', example: 'open' })
  @IsString()
  @IsOptional()
  status: string; 
}
