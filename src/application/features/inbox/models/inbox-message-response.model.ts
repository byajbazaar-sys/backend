import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EInboxMessageAuthor, EInboxMessageStatus } from '../enums';

export class InboxMessageResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() conversationId: string;
  @Expose() @ApiProperty({ enum: EInboxMessageAuthor }) author: EInboxMessageAuthor;
  @Expose() @ApiProperty() text: string;
  @Expose() @ApiProperty({ enum: EInboxMessageStatus }) status: EInboxMessageStatus;
  @Expose() @ApiPropertyOptional() error: string | null;
  @Expose() @ApiProperty() @Type(() => Date) createdAt: Date;
}
