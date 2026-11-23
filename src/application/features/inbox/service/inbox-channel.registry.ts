import { Injectable } from '@nestjs/common';

import { IInboxChannelSender } from '../domain';
import { EInboxChannel } from '../enums';

export const INBOX_CHANNEL_REGISTRY = 'INBOX_CHANNEL_REGISTRY';

/**
 * The channels replies can go out on. Each sender registers itself when its module starts: Instagram lives in the
 * marketing module (it holds the Instagram token), so the inbox cannot inject it directly.
 */
@Injectable()
export class InboxChannelRegistry {
  private readonly senders = new Map<EInboxChannel, IInboxChannelSender>();

  register(sender: IInboxChannelSender): void {
    this.senders.set(sender.channel, sender);
  }

  get(channel: EInboxChannel): IInboxChannelSender | null {
    return this.senders.get(channel) ?? null;
  }
}
