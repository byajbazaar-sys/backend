import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean } from 'class-validator';
export class KaggleSettingsModel {
  @ApiProperty({
    description:
      'Fix stuck renders automatically: retry failed account setups after 30 min, move renders Kaggle keeps queued or that never boot to another account',
  })
  @Expose()
  @IsBoolean()
  autoRecover: boolean;
}
