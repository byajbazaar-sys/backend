import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { EInboxChannel, EInboxConversationState } from '../enums';

export class InboxConversationResponseModel {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty({ enum: EInboxChannel }) channel: EInboxChannel;
  @Expose() @ApiProperty({ description: 'WhatsApp number (digits) or Instagram-scoped ID' }) externalUserId: string;
  @Expose() @ApiPropertyOptional() customerName: string | null;
  @Expose() @ApiPropertyOptional() customerId: string | null;
  @Expose() @ApiProperty({ enum: EInboxConversationState }) state: EInboxConversationState;
  @Expose() @ApiProperty() unreadCount: number;
  @Expose() @ApiPropertyOptional() @Type(() => Date) lastMessageAt: Date | null;
  @Expose() @ApiPropertyOptional() @Type(() => Date) lastInboundAt: Date | null;
  @Expose() @ApiPropertyOptional() lastMessagePreview: string | null;
  @Expose() @ApiPropertyOptional() @Type(() => Date) needsReplySince: Date | null;
  @Expose() @ApiPropertyOptional() handoffReason: string | null;
  @Expose() @ApiPropertyOptional() @Type(() => Date) lastOwnerReplyAt: Date | null;
  @Expose() @ApiProperty() @Type(() => Date) createdAt: Date;
}

export class InboxConversationsPagedResponseModel {
  @Expose()
  @ApiProperty({ type: [InboxConversationResponseModel] })
  @Type(() => InboxConversationResponseModel)
  items: InboxConversationResponseModel[];
  @Expose() @ApiProperty() page: number;
  @Expose() @ApiProperty() perPage: number;
  @Expose() @ApiProperty() totalPages: number;
  @Expose() @ApiProperty() totalCount: number;
  @Expose() @ApiProperty() hasNextPage: boolean;
  @Expose() @ApiProperty() hasPreviousPage: boolean;
}

export class InboxSummaryResponseModel {
  @Expose() @ApiProperty({ description: 'Conversations waiting for the owner' }) needsReply: number;
  @Expose() @ApiProperty({ description: 'Unread customer messages' }) unread: number;
}
