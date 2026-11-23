import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { IWhatsAppService, WHATSAPP_SERVICE } from '../../whatsapp/service/i-whatsapp.service';
import { IInboxChannelSender, InboxChannelStatus } from '../domain';
import { EInboxChannel } from '../enums';
import { INBOX_CHANNEL_REGISTRY, InboxChannelRegistry } from './inbox-channel.registry';

/**
 * Inbox replies over the business's own WhatsApp number. Inside WhatsApp's 24-hour customer-service window a reply
 * is plain text (the bot always answers inside it: the customer just wrote); after it, WhatsApp needs an approved
 * template, and the owner gets WhatsApp's own error to act on.
 */
@Injectable()
export class WhatsAppInboxChannel implements IInboxChannelSender, OnModuleInit {
  readonly channel = EInboxChannel.WhatsApp;

  constructor(
    @Inject(WHATSAPP_SERVICE) private readonly whatsapp: IWhatsAppService,
    @Inject(INBOX_CHANNEL_REGISTRY) private readonly registry: InboxChannelRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async send(userId: string, to: string, text: string): Promise<{ externalMessageId?: string | null }> {
    const result = await this.whatsapp.sendTextMessage(userId, userId, to, text);
    return { externalMessageId: result?.messageId ?? null };
  }

  async status(userId: string): Promise<InboxChannelStatus> {
    const connection = await this.whatsapp.getWhatsAppConnection(userId, userId).catch(() => null);
    if (!connection) {
      return { connected: false, ready: false, reason: 'Connect WhatsApp Business in Account settings first.' };
    }
    if (connection.canSendMessages === false) {
      return {
        connected: true,
        ready: false,
        reason: connection.messagingBlockReason || 'WhatsApp cannot send messages from this number yet.',
      };
    }
    return { connected: true, ready: true };
  }
}
