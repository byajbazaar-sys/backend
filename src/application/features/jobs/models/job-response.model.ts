import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsObject, IsDate } from 'class-validator';
import { Expose, Type } from 'class-transformer';

export class JobResponseModel {
  @Expose()
  @ApiProperty({ description: 'Unique identifier of the job', example: '656f3a7e2f1b2c3d4e5f6a7b' })
  @IsString()
  id: string;

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
    description: 'Expiration time in ISO 8601 format',
    example: '2023-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDate()
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
  @Type(() => Date)
  public createdAt?: Date;

  @Expose()
  @Type(() => Date)
  public updatedAt?: Date;

  @ApiProperty({ description: 'Number of openings for the job', example: 5 })
  @Expose()
  numberOfOpenings: number;

  @ApiProperty({ description: 'Status of the job', example: 'open' })
  @Expose()
  status: string;
}
