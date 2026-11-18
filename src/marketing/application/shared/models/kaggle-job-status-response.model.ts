import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
/** Status of one Kaggle notebook run (image notebook or video notebook). */
export class KaggleJobStatusResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty({ enum: ['image', 'video', 'setup'] }) notebook: string;
  @Expose() @ApiProperty({ enum: ['WAITING', 'STARTING', 'RUNNING', 'DONE', 'FAILED'] }) status: string;
  @Expose() @ApiProperty() progress: number;
  @Expose() @ApiPropertyOptional() stageMessage: string | null;
  @Expose() @ApiPropertyOptional() error: string | null;
  @Expose() @ApiProperty({ description: 'Automatic continuations in new Kaggle sessions' }) attempts: number;
  @Expose() @Type(() => Date) @ApiPropertyOptional() queuedAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() startedAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() finishedAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() updatedAt: Date | null;
}
