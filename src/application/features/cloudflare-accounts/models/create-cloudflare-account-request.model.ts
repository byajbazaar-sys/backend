import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { trimValue } from './cloudflare-account.transforms';

export class CreateCloudflareAccountRequestModel {
  @ApiProperty({ description: 'Cloudflare account ID (32 hex characters, Dashboard → Workers AI)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[a-f0-9]{32}$/, { message: 'accountId must be a 32-character Cloudflare account ID' })
  accountId: string;

  @ApiProperty({ description: 'API token with Workers AI Read + Edit permission. Stored as plain text, never returned by the API.' })
  @Transform(trimValue)
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  apiToken: string;

  @ApiPropertyOptional({ description: 'Free-text note (owner, email alias…)' })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Save without checking the token against Cloudflare first', default: false })
  @IsOptional()
  @IsBoolean()
  skipVerification?: boolean;
}
