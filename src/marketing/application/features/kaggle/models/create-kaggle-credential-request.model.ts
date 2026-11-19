import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { trim } from './kaggle-credential.transforms';

export class CreateKaggleCredentialRequestModel {
  @ApiProperty({ description: 'Kaggle username (stored lower-case)', example: 'my-kaggle-user' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,99}$/, { message: 'username must be a valid Kaggle username' })
  username: string;

  @ApiProperty({ description: 'API key from kaggle.json, or a KGAT_… access token. Stored encrypted.' })
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey: string;

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

  @ApiPropertyOptional({ description: 'Save without checking the credentials against Kaggle first', default: false })
  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean;
}
