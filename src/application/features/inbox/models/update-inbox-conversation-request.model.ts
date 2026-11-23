import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsIn } from 'class-validator';

import { EInboxConversationState } from '../enums';

export class UpdateInboxConversationRequestModel {
  @Expose()
  @ApiProperty({
    enum: [EInboxConversationState.Auto, EInboxConversationState.NeedsReply],
    description: 'auto = let the assistant answer again; needs_reply = keep it for you',
  })
  @IsIn([EInboxConversationState.Auto, EInboxConversationState.NeedsReply])
  state: EInboxConversationState.Auto | EInboxConversationState.NeedsReply;
}
