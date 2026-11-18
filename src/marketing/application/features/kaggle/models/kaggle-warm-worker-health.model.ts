import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class KaggleWarmWorkerHealthModel {
  @ApiProperty({ description: 'Live warm sessions on the account' }) @Expose() sessions: number;
  @ApiProperty({ enum: ['starting', 'idle', 'busy'] }) @Expose() state: 'starting' | 'idle' | 'busy';
  @ApiPropertyOptional() @Expose() idleMinutes: number | null;
  @ApiProperty() @Expose() jobsRun: number;
  @ApiPropertyOptional({ description: 'Mounted the private model dataset (no downloads)' })
  @Expose()
  modelsCached: boolean | null;
  @ApiPropertyOptional({ description: 'Kaggle session hours left' }) @Expose() hoursLeft: number | null;
  @ApiPropertyOptional({ description: 'Pipeline loaded on the GPUs: image or video' }) @Expose() pipeline:
    | string
    | null;
  @ApiPropertyOptional() @Expose() kernelRef: string | null;
  @ApiPropertyOptional() @Expose() startedAt: Date | null;
}
