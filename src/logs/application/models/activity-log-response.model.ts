import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EActivityLogCategory } from '../../../application';
export class ActivityLogResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty({ enum: EActivityLogCategory }) category: EActivityLogCategory;
  @Expose() @ApiProperty({ example: 'REMINDER_SENT' }) action: string;
  @Expose() @ApiProperty({ example: 'due' }) entityType: string;
  @Expose() @ApiPropertyOptional({ nullable: true }) entityId: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true, description: 'The shop the entry belongs to' }) userId:
    | string
    | null;
  @Expose() @ApiPropertyOptional({ nullable: true }) performedBy: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true }) performedByName: string | null;
  @Expose() @ApiPropertyOptional({ nullable: true, example: 'web' }) channel: string | null;
  @Expose() @ApiProperty({ type: Object }) data: Record<string, unknown>;
  @Expose() @ApiProperty() @Type(() => Date) createdAt: Date;
}
