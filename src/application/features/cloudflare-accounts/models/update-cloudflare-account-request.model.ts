import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { trimValue } from './cloudflare-account.transforms';

export class UpdateCloudflareAccountRequestModel {
  @ApiPropertyOptional({ description: 'New API token (stored as plain text)' })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  apiToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(100)
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
