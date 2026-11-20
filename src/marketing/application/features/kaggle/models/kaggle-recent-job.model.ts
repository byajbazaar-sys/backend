import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
/** A finished notebook run. */
export class KaggleRecentJobModel {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() kind: string;
  @ApiProperty({ enum: ['image', 'video', 'voice'] }) @Expose() notebook: string;
  @ApiProperty() @Expose() target: string;
  @ApiProperty({ enum: ['DONE', 'FAILED'] }) @Expose() status: string;
  @ApiPropertyOptional() @Expose() account: string | null;
  @ApiProperty() @Expose() attempts: number;
  @ApiPropertyOptional() @Expose() durationMinutes: number | null;
  @ApiPropertyOptional() @Expose() error: string | null;
  @ApiPropertyOptional() @Expose() finishedAt: Date | null;
}
