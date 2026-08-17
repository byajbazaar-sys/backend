import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class WebhookAckResponseModel {
  @Expose()
  @ApiProperty()
  received!: boolean;

  @Expose()
  @ApiPropertyOptional()
  duplicate?: boolean;
}
