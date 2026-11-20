import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { CustomerErrorText, CustomerStageText, MARKETING_ADMIN_GROUP } from '../utils/customer-text';
/** Status of one Kaggle notebook run (image notebook or video notebook). */
export class KaggleJobStatusResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty({ enum: ['image', 'video', 'voice', 'setup'] }) notebook: string;
  @Expose() @ApiProperty({ enum: ['WAITING', 'STARTING', 'RUNNING', 'DONE', 'FAILED'] }) status: string;
  @Expose() @ApiProperty() progress: number;
  @Expose() @CustomerStageText() @ApiPropertyOptional() stageMessage: string | null;
  @Expose() @CustomerErrorText() @ApiPropertyOptional() error: string | null;
  @Expose() @ApiProperty({ description: 'Automatic continuations after an interruption' }) attempts: number;
  /** Admins only: which render account runs it, and its notebook (owner/slug). */
  @Expose({ groups: [MARKETING_ADMIN_GROUP] }) @ApiPropertyOptional() workerId?: string | null;
  @Expose({ groups: [MARKETING_ADMIN_GROUP] }) @ApiPropertyOptional() kernelRef?: string | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() queuedAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() startedAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() finishedAt: Date | null;
  @Expose() @Type(() => Date) @ApiPropertyOptional() updatedAt: Date | null;
}
