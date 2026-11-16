import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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
  @Max(4)
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

export class UpdateKaggleCredentialRequestModel {
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
  @Max(4)
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

/** Never contains the key itself — only a masked hint. */
export class KaggleCredentialResponseModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() username: string;
  @ApiPropertyOptional() @Expose() label: string | null;
  @ApiProperty({ example: 'KGAT…9f3a' }) @Expose() maskedKey: string;
  @ApiProperty({ description: 'False when the stored key cannot be decrypted (secret changed) — re-enter it' })
  @Expose()
  keyReadable: boolean;
  @ApiProperty() @Expose() concurrency: number;
  @ApiProperty() @Expose() enabled: boolean;
  @ApiPropertyOptional({
    description: 'Runtime status from kaggle_accounts (NEW, SETTING_UP, READY, FAILED, DISABLED)',
  })
  @Expose()
  status: string | null;
  @ApiPropertyOptional() @Expose() lastError: string | null;
  @ApiPropertyOptional() @Expose() gpuInfo: string | null;
  @ApiPropertyOptional() @Expose() readyAt: Date | null;
  @ApiPropertyOptional({ description: 'Weekly GPU hours left (fresh on create / verify, else the cached value)' })
  @Expose()
  gpuHoursLeft?: number | null;
  @ApiPropertyOptional({ description: 'When the GPU quota was last checked with Kaggle' })
  @Expose()
  quotaCheckedAt: Date | null;
  @ApiProperty({ description: 'Notebooks running on the account right now' }) @Expose() busySlots: number;
  @ApiPropertyOptional({ description: 'Given no new jobs until then (it failed to start a notebook)' })
  @Expose()
  cooldownUntil: Date | null;
  @ApiPropertyOptional() @Expose() lastAssignedAt: Date | null;
  @ApiProperty() @Expose() jobsCompleted: number;
  @ApiProperty() @Expose() jobsFailed: number;
  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;
}

export class BulkCreateKaggleCredentialsRequestModel {
  @ApiProperty({ type: [CreateKaggleCredentialRequestModel], maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateKaggleCredentialRequestModel)
  accounts: CreateKaggleCredentialRequestModel[];
}

export class BulkCreateKaggleCredentialResultModel {
  @ApiProperty() @Expose() username: string;
  @ApiProperty({ enum: ['created', 'exists', 'failed'] }) @Expose() result: 'created' | 'exists' | 'failed';
  @ApiPropertyOptional() @Expose() error?: string;
  @ApiPropertyOptional() @Expose() gpuHoursLeft?: number | null;
}

export class KaggleRunningJobModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty({ enum: ['CAMPAIGN', 'LOGO', 'SETUP'] }) @Expose() kind: string;
  @ApiProperty() @Expose() status: string;
  @ApiPropertyOptional() @Expose() account: string | null;
  @ApiPropertyOptional() @Expose() slot: number | null;
  @ApiProperty() @Expose() progress: number;
  @ApiPropertyOptional() @Expose() stageMessage: string | null;
  @ApiProperty() @Expose() attempts: number;
  @ApiPropertyOptional() @Expose() startedAt: Date | null;
}

/** Queue + capacity at a glance for the admin screen. */
export class KaggleOverviewResponseModel {
  @ApiProperty() @Expose() accounts: number;
  @ApiProperty({ description: 'Ready and not cooling down' }) @Expose() ready: number;
  @ApiProperty() @Expose() settingUp: number;
  @ApiProperty({ description: 'Parallel notebooks the ready accounts can run' }) @Expose() slots: number;
  @ApiProperty() @Expose() busy: number;
  @ApiProperty({ description: 'Render jobs waiting for a free GPU' }) @Expose() waiting: number;
  @ApiProperty({ type: [KaggleRunningJobModel] })
  @Expose()
  @Type(() => KaggleRunningJobModel)
  running: KaggleRunningJobModel[];
}

export class KaggleCredentialVerifyResponseModel {
  @ApiProperty() @Expose() username: string;
  @ApiProperty() @Expose() valid: boolean;
  @ApiPropertyOptional() @Expose() gpuHoursLeft: number | null;
  @ApiPropertyOptional() @Expose() error?: string;
}
