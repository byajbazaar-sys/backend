import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class NotifyOrderResponseModel {
  @Expose()
  @ApiProperty()
  sent: boolean;

  @Expose()
  @ApiProperty()
  channel: string;

  @Expose()
  @ApiPropertyOptional()
  recipient?: string;

  @Expose()
  @ApiPropertyOptional()
  reason?: string;
}
