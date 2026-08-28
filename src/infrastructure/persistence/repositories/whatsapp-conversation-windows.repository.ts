import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IWhatsAppConversationWindowsRepository } from '../../../application/features/whatsapp/service/i-whatsapp-conversation-windows.repository';
import { normalizeWhatsAppRecipient } from '../../../application/features/whatsapp/utils/whatsapp-messaging.util';
import { WhatsAppConversationWindowEntity } from '../entities/whatsapp-conversation-window.entity';

@Injectable()
export class WhatsAppConversationWindowsRepository implements IWhatsAppConversationWindowsRepository {
  constructor(
    @InjectRepository(WhatsAppConversationWindowEntity)
    private readonly repo: Repository<WhatsAppConversationWindowEntity>,
  ) {}

  async getLastInboundAt(
    userId: string,
    wabaId: string,
    phoneNumberId: string,
    recipient: string,
  ): Promise<Date | null> {
    const row = await this.repo.findOne({
      where: {
        userId,
        wabaId,
        phoneNumberId,
        recipient: normalizeWhatsAppRecipient(recipient),
      },
    });
    return row?.lastInboundAt ?? null;
  }

  async recordInboundMessage(
    userId: string,
    wabaId: string,
    phoneNumberId: string,
    recipient: string,
    inboundAt: Date,
  ): Promise<void> {
    const normalizedRecipient = normalizeWhatsAppRecipient(recipient);
    const existing = await this.repo.findOne({
      where: { userId, wabaId, phoneNumberId, recipient: normalizedRecipient },
    });

    if (existing) {
      if (inboundAt > existing.lastInboundAt) {
        existing.lastInboundAt = inboundAt;
        await this.repo.save(existing);
      }
      return;
    }

    await this.repo.save(
      this.repo.create({
        userId,
        wabaId,
        phoneNumberId,
        recipient: normalizedRecipient,
        lastInboundAt: inboundAt,
      }),
    );
  }
}
