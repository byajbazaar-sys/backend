import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
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
