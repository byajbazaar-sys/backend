import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { ColabSettingsResponseModel } from './colab-settings-response.model';
/** Never contains the key itself — only a masked hint. */
export class KaggleCredentialResponseModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() username: string;
  @ApiProperty({ enum: ['kaggle', 'colab'] }) @Expose() provider: string;
  @ApiPropertyOptional({ type: ColabSettingsResponseModel, description: 'Colab Enterprise settings (no key)' })
  @Expose()
  @Type(() => ColabSettingsResponseModel)
  colab: ColabSettingsResponseModel | null;
  @ApiPropertyOptional() @Expose() label: string | null;
  @ApiProperty({ example: 'KGAT…9f3a', description: 'Kaggle: masked key; Colab: the service account' })
  @Expose()
  maskedKey: string;
  @ApiProperty({
    description: 'False when the stored key is empty or an old encrypted key could not be converted — re-enter it',
  })
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
