import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class KaggleRunningJobModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty({ enum: ['CAMPAIGN', 'IMAGES', 'LOGO', 'SETUP'] }) @Expose() kind: string;
  @ApiProperty({ enum: ['image', 'video', 'voice', 'setup'], description: 'Kaggle notebook running the job' })
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
