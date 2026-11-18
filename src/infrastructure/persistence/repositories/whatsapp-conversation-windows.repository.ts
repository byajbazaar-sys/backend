import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IWhatsAppConversationWindowsRepository, normalizeWhatsAppRecipient } from '../../../application';
import { WhatsAppConversationWindowEntity } from '../entities';

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
