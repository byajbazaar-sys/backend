import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
export class KaggleSettingsModel {
  @ApiProperty({
    description:
      'Fix stuck renders automatically: retry failed account setups after 30 min, move renders Kaggle keeps queued or that never boot to another account',
  })
  @Expose()
  @IsBoolean()
  autoRecover: boolean;

  @ApiProperty({
    description:
      'Minutes a warm GPU worker with nothing to do stays alive (models loaded, next job starts at once) before it stops to save GPU quota. 0 = stop as soon as the queue is empty.',
    minimum: 0,
    maximum: 240,
  })
  @Expose()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  warmIdleMinutes: number;
}
