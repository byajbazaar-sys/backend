import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { trim } from './kaggle-credential.transforms';

/** Colab Enterprise settings of a GPU account (the key goes in serviceAccountKey). Unset fields keep their default. */
export class ColabSettingsRequestModel {
  @ApiPropertyOptional({ description: 'Google Cloud project id (read from the key when not given)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/, { message: 'projectId must be a Google Cloud project id' })
  projectId?: string;

  @ApiPropertyOptional({ description: 'Region with Colab Enterprise GPUs', example: 'asia-south1' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[a-z]+-[a-z]+\d+$/, { message: 'region must look like asia-south1 or us-central1' })
  region?: string;

  @ApiPropertyOptional({
    description: 'Cloud Storage bucket for run outputs and the model cache',
    example: 'my-bucket',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .trim()
          .replace(/^gs:\/\//, '')
          .replace(/\/.*$/, '')
      : value,
  )
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/, { message: 'bucket must be a Cloud Storage bucket name' })
  bucket?: string;

  @ApiPropertyOptional({ description: 'Service account the notebook runs as (the key’s own when not given)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  serviceAccountEmail?: string;

  @ApiPropertyOptional({ example: 'n1-standard-8' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[a-z0-9]+-[a-z0-9-]+$/, { message: 'machineType must be a Compute Engine machine type' })
  machineType?: string;

  @ApiPropertyOptional({ enum: ['NVIDIA_TESLA_T4', 'NVIDIA_L4'] })
  @IsOptional()
  @IsIn(['NVIDIA_TESLA_T4', 'NVIDIA_L4'])
  acceleratorType?: 'NVIDIA_TESLA_T4' | 'NVIDIA_L4';

  @ApiPropertyOptional({ minimum: 1, maximum: 4, default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  acceleratorCount?: number;

  @ApiPropertyOptional({ minimum: 100, maximum: 1000, default: 200 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(1000)
  diskSizeGb?: number;

  @ApiPropertyOptional({ description: 'Hard cap on one session (billing safety)', minimum: 1, maximum: 24, default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxSessionHours?: number;
}
