import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class BulkCreateKaggleCredentialResultModel {
  @ApiProperty() @Expose() username: string;
  @ApiProperty({ enum: ['created', 'exists', 'failed'] }) @Expose() result: 'created' | 'exists' | 'failed';
  @ApiPropertyOptional() @Expose() error?: string;
  @ApiPropertyOptional() @Expose() gpuHoursLeft?: number | null;
}
