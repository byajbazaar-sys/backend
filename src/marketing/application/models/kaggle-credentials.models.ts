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
  @ApiProperty({ enum: ['CAMPAIGN', 'IMAGES', 'LOGO', 'SETUP'] }) @Expose() kind: string;
  @ApiProperty({ enum: ['image', 'video', 'setup'], description: 'Kaggle notebook running the job' })
  @Expose()
  notebook: string;
  @ApiProperty({ description: 'What the job works on' }) @Expose() target: string;
  @ApiPropertyOptional({ description: 'owner/kernel-slug on Kaggle' }) @Expose() kernelRef: string | null;
  @ApiProperty() @Expose() status: string;
  @ApiPropertyOptional() @Expose() account: string | null;
  @ApiPropertyOptional() @Expose() slot: number | null;
  @ApiProperty() @Expose() progress: number;
  @ApiPropertyOptional() @Expose() stageMessage: string | null;
  @ApiProperty() @Expose() attempts: number;
  @ApiPropertyOptional() @Expose() startedAt: Date | null;
  @ApiPropertyOptional({ description: 'Last progress report' }) @Expose() updatedAt: Date | null;
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

export class KaggleHealthIssueModel {
  @ApiProperty({ enum: ['error', 'warning', 'info'] }) @Expose() level: 'error' | 'warning' | 'info';
  @ApiProperty({ example: 'NO_ACCOUNTS' }) @Expose() code: string;
  @ApiProperty() @Expose() message: string;
  @ApiPropertyOptional() @Expose() account?: string;
  @ApiPropertyOptional() @Expose() jobId?: string;
}

export class KaggleWaitingJobModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() kind: string;
  @ApiProperty({ enum: ['image', 'video'] }) @Expose() notebook: string;
  @ApiProperty() @Expose() target: string;
  @ApiPropertyOptional() @Expose() campaignId: string | null;
  @ApiProperty() @Expose() attempts: number;
  @ApiProperty() @Expose() waitingMinutes: number;
  @ApiPropertyOptional() @Expose() stageMessage: string | null;
}

export class KaggleNotebookHealthModel {
  @ApiPropertyOptional() @Expose() jobId: string | null;
  @ApiProperty({ description: 'IDLE, COOLDOWN, STARTING, QUEUED, RUNNING, COMPLETE, ERROR, CANCELLED, or UNKNOWN' })
  @Expose()
  status: string;
  @ApiPropertyOptional() @Expose() kernelRef: string | null;
  @ApiPropertyOptional() @Expose() progress: number | null;
  @ApiPropertyOptional() @Expose() stageMessage: string | null;
  @ApiPropertyOptional() @Expose() failureMessage: string | null;
  @ApiPropertyOptional() @Expose() target: string | null;
  @ApiPropertyOptional() @Expose() attempts: number | null;
  @ApiPropertyOptional() @Expose() startedAt: Date | null;
  @ApiPropertyOptional({ description: 'Last progress report' }) @Expose() updatedAt: Date | null;
}

/** One notebook pipeline (image or video) across every account. */
export class KagglePipelineModel {
  @ApiProperty({ enum: ['image', 'video'] }) @Expose() notebook: string;
  @ApiProperty({ enum: ['running', 'starting', 'waiting', 'idle', 'failing'] }) @Expose() state: string;
  @ApiProperty() @Expose() running: number;
  @ApiProperty() @Expose() starting: number;
  @ApiProperty() @Expose() waiting: number;
  @ApiPropertyOptional() @Expose() lastSuccessAt: Date | null;
  @ApiPropertyOptional() @Expose() lastFailureAt: Date | null;
  @ApiPropertyOptional() @Expose() lastFailure: string | null;
  @ApiProperty({ description: 'Finished runs in the recent window' }) @Expose() recentDone: number;
  @ApiProperty() @Expose() recentFailed: number;
}

/** A finished notebook run. */
export class KaggleRecentJobModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() kind: string;
  @ApiProperty({ enum: ['image', 'video'] }) @Expose() notebook: string;
  @ApiProperty() @Expose() target: string;
  @ApiProperty({ enum: ['DONE', 'FAILED'] }) @Expose() status: string;
  @ApiPropertyOptional() @Expose() account: string | null;
  @ApiProperty() @Expose() attempts: number;
  @ApiPropertyOptional() @Expose() durationMinutes: number | null;
  @ApiPropertyOptional() @Expose() error: string | null;
  @ApiPropertyOptional() @Expose() finishedAt: Date | null;
}

export class KaggleAccountNotebookHealthModel {
  @ApiProperty() @Expose() account: string;
  @ApiProperty() @Expose() accountStatus: string;
  @ApiProperty({ type: KaggleNotebookHealthModel })
  @Expose()
  @Type(() => KaggleNotebookHealthModel)
  video: KaggleNotebookHealthModel;
  @ApiProperty({ type: KaggleNotebookHealthModel })
  @Expose()
  @Type(() => KaggleNotebookHealthModel)
  image: KaggleNotebookHealthModel;
}

/** Is rendering working, and if not, why. */
export class KaggleHealthResponseModel {
  @ApiProperty({ enum: ['healthy', 'degraded', 'down'] }) @Expose() status: 'healthy' | 'degraded' | 'down';
  @ApiProperty() @Expose() checkedAt: Date;
  @ApiProperty() @Expose() autoRecover: boolean;
  @ApiProperty({ description: 'Accounts that can take a render right now' }) @Expose() usableAccounts: number;
  @ApiProperty() @Expose() waiting: number;
  @ApiPropertyOptional() @Expose() oldestWaitingMinutes: number | null;
  @ApiProperty({ type: [KaggleAccountNotebookHealthModel] })
  @Expose()
  @Type(() => KaggleAccountNotebookHealthModel)
  notebooks: KaggleAccountNotebookHealthModel[];
  @ApiProperty({ type: [KaggleHealthIssueModel] })
  @Expose()
  @Type(() => KaggleHealthIssueModel)
  issues: KaggleHealthIssueModel[];
  @ApiProperty({ type: [KaggleWaitingJobModel] })
  @Expose()
  @Type(() => KaggleWaitingJobModel)
  waitingJobs: KaggleWaitingJobModel[];
  @ApiProperty({ type: [KagglePipelineModel], description: 'Image notebook and video notebook status' })
  @Expose()
  @Type(() => KagglePipelineModel)
  pipelines: KagglePipelineModel[];
  @ApiProperty({ type: [KaggleRecentJobModel] })
  @Expose()
  @Type(() => KaggleRecentJobModel)
  recentJobs: KaggleRecentJobModel[];
}

export class KaggleRecoveryJobModel {
  @ApiProperty() @Expose() id: string;
  @ApiPropertyOptional() @Expose() account: string | null;
  @ApiProperty() @Expose() reason: string;
}

export class KaggleRecoveryResponseModel {
  @ApiProperty({ type: [String] }) @Expose() setupsRestarted: string[];
  @ApiProperty({ type: [String] }) @Expose() cooldownsCleared: string[];
  @ApiProperty({ type: [KaggleRecoveryJobModel] })
  @Expose()
  @Type(() => KaggleRecoveryJobModel)
  jobsRestarted: KaggleRecoveryJobModel[];
}

export class KaggleSettingsModel {
  @ApiProperty({
    description:
      'Fix stuck renders automatically: retry failed account setups after 30 min, move renders Kaggle keeps queued or that never boot to another account',
  })
  @Expose()
  @IsBoolean()
  autoRecover: boolean;
}

export class RestartRenderJobResponseModel {
  @ApiProperty({ enum: ['restarted', 'dispatched'] }) @Expose() result: 'restarted' | 'dispatched';
}
