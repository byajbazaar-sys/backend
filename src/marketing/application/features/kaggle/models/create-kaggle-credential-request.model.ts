import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { ColabSettingsRequestModel } from './colab-settings-request.model';
import { trim } from './kaggle-credential.transforms';

export class CreateKaggleCredentialRequestModel {
  @ApiPropertyOptional({
    description: 'kaggle (default) or colab (Colab Enterprise on Google Cloud, billed per use)',
    enum: ['kaggle', 'colab'],
    default: 'kaggle',
  })
  @IsOptional()
  @IsIn(['kaggle', 'colab'])
  provider?: 'kaggle' | 'colab';

  @ApiProperty({
    description: 'Kaggle username, or a name for the Colab account (stored lower-case)',
    example: 'my-kaggle-user',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,99}$/, { message: 'username must be letters, digits, - and _' })
  username: string;

  @ApiPropertyOptional({
    description:
      'Kaggle: API key from kaggle.json, or a KGAT_… access token. Stored as plain text, never returned by the API.',
  })
  @ValidateIf((o: CreateKaggleCredentialRequestModel) => o.provider !== 'colab')
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey: string;

  @ApiPropertyOptional({
    description: 'Colab: the service-account key JSON. Stored as plain text, never returned by the API.',
  })
  @ValidateIf((o: CreateKaggleCredentialRequestModel) => o.provider === 'colab')
  @Transform(trim)
  @IsString()
  @MinLength(100)
  @MaxLength(10000)
  serviceAccountKey?: string;

  @ApiPropertyOptional({ type: ColabSettingsRequestModel, description: 'Colab: project, region, bucket, machine' })
  @ValidateIf((o: CreateKaggleCredentialRequestModel) => o.provider === 'colab')
  @ValidateNested()
  @Type(() => ColabSettingsRequestModel)
  colab?: ColabSettingsRequestModel;

  @ApiPropertyOptional({ description: 'Parallel notebooks this account may run', minimum: 1, maximum: 4, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  concurrency?: number;

  @ApiPropertyOptional({ description: 'Free-text note (owner, purpose…)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({ description: 'Use the account for renders', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Save without checking the credentials first', default: false })
  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean;
}
