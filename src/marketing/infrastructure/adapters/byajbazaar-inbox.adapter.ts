import { Inject, Injectable } from '@nestjs/common';

// Leaf imports: the inbox barrel pulls in WhatsApp and orders, which can leave these tokens undefined at load time.
import { EInboxChannel } from '../../../application/features/inbox/enums';
import { IInboxService, INBOX_SERVICE } from '../../../application/features/inbox/service/i-inbox.service';
import {
  INBOX_CHANNEL_REGISTRY,
  InboxChannelRegistry,
} from '../../../application/features/inbox/service/inbox-channel.registry';
import { IMarketingInbox, MarketingInboxMessage, MarketingInstagramReplies } from '../../application';

/** Instagram DMs into ByajBazaar's customer inbox, and the inbox's Instagram replies back through marketing. */
@Injectable()
export class ByajBazaarInboxAdapter implements IMarketingInbox {
  constructor(
    @Inject(INBOX_SERVICE) private readonly inbox: IInboxService,
    @Inject(INBOX_CHANNEL_REGISTRY) private readonly channels: InboxChannelRegistry,
  ) {}

  async receiveInstagram(message: MarketingInboxMessage): Promise<void> {
    await this.inbox.receive({
      userId: message.userId,
      channel: EInboxChannel.Instagram,
      externalUserId: message.customerId,
      customerName: message.customerName,
      text: message.text,
      isText: message.isText,
      externalMessageId: message.messageId,
      receivedAt: message.receivedAt,
    });
  }

  provideInstagramReplies(replies: MarketingInstagramReplies): void {
    this.channels.register({
      channel: EInboxChannel.Instagram,
      send: async (userId, customerId, text, by) => ({
        externalMessageId: (await replies.send(userId, customerId, text, by)).messageId,
      }),
      status: (userId) => replies.status(userId),
      prepare: (userId) => replies.prepare(userId),
    });
  }
}
