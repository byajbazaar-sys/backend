import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { GeneratedImageResponseModel } from './generated-image-response.model';

export class TryOnJobResponseModel {
  @Expose()
  @ApiProperty()
  jobId!: string;

  @Expose()
  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'FAILED'] })
  status!: 'PENDING' | 'COMPLETED' | 'FAILED';

  @Expose()
  @ApiPropertyOptional()
  error?: string;

  @Expose()
  @ApiPropertyOptional({ type: [GeneratedImageResponseModel] })
  @Type(() => GeneratedImageResponseModel)
  images?: GeneratedImageResponseModel[];

  @Expose()
  @ApiPropertyOptional()
  createdAt?: string;

  @Expose()
  @ApiPropertyOptional()
  updatedAt?: string;
}
