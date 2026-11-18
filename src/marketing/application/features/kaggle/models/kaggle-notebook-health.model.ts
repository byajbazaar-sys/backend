import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
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
