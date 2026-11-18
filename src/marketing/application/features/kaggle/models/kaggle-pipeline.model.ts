import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
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
