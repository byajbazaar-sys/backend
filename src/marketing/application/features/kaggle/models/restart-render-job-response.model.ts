import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class RestartRenderJobResponseModel {
  @ApiProperty({ enum: ['restarted', 'dispatched'] }) @Expose() result: 'restarted' | 'dispatched';
}
