import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class KaggleHealthIssueModel {
  @ApiProperty({ enum: ['error', 'warning', 'info'] }) @Expose() level: 'error' | 'warning' | 'info';
  @ApiProperty({ example: 'NO_ACCOUNTS' }) @Expose() code: string;
  @ApiProperty() @Expose() message: string;
  @ApiPropertyOptional() @Expose() account?: string;
  @ApiPropertyOptional() @Expose() jobId?: string;
}
