import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
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
  @ApiPropertyOptional({ description: 'Private Kaggle dataset with every model (warm workers mount it), once built' })
  @Expose()
  modelsDataset: string | null;
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
