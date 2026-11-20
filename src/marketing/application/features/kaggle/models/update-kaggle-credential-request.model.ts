import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { ColabSettingsRequestModel } from './colab-settings-request.model';
import { trim } from './kaggle-credential.transforms';

export class UpdateKaggleCredentialRequestModel {
  @ApiPropertyOptional({ description: 'Colab: a new service-account key JSON (re-verified unless skipVerification)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(100)
  @MaxLength(10000)
  serviceAccountKey?: string;

  @ApiPropertyOptional({ type: ColabSettingsRequestModel, description: 'Colab: settings to change' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ColabSettingsRequestModel)
  colab?: ColabSettingsRequestModel;

  @ApiPropertyOptional({ description: 'New API key / access token (re-verified unless skipVerification)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  concurrency?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean;
}
