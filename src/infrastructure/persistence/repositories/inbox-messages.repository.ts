import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { IsNull, LessThan, MoreThanOrEqual, Repository } from 'typeorm';

import { EInboxMessageAuthor, IInboxMessagesRepository, InboxMessage } from '../../../application';
import { InboxMessageEntity } from '../entities';

@Injectable()
export class InboxMessagesRepository implements IInboxMessagesRepository {
  constructor(@InjectRepository(InboxMessageEntity) private readonly repo: Repository<InboxMessageEntity>) {}

  async insert(message: Omit<InboxMessage, 'id' | 'createdAt' | 'botHandledAt'>): Promise<InboxMessage | null> {
    // ON CONFLICT DO NOTHING on the partial unique index (conversation, external message id): a webhook retry of a
    // customer message inserts nothing.
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(InboxMessageEntity)
      .values({ ...message, text: message.text.slice(0, 4000) })
      .orIgnore()
      .returning('*')
      .execute();
    const row = (result.raw as InboxMessageEntity[] | undefined)?.[0];
    if (!row) return null;
    return this.findById((row as unknown as { id: string }).id);
  }

  async findById(id: string): Promise<InboxMessage | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async update(id: string, patch: Partial<InboxMessage>): Promise<void> {
    const rest: Partial<InboxMessage> = { ...patch };
    for (const key of ['id', 'createdAt'] as const) delete rest[key];
    if (Object.keys(rest).length) await this.repo.update(id, rest as Partial<InboxMessageEntity>);
  }

  async listForConversation(conversationId: string, limit: number, before?: Date): Promise<InboxMessage[]> {
    const rows = await this.repo.find({
      where: { conversationId, ...(before ? { createdAt: LessThan(before) } : {}) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => this.toDomain(row));
  }

  countBotRepliesSince(conversationId: string, since: Date): Promise<number> {
    return this.repo.count({
      where: { conversationId, author: EInboxMessageAuthor.Bot, createdAt: MoreThanOrEqual(since) },
    });
  }

  async claimForBot(id: string): Promise<boolean> {
    const result = await this.repo.update({ id, botHandledAt: IsNull() }, { botHandledAt: new Date() });
    return (result.affected ?? 0) > 0;
  }

  private toDomain(row: InboxMessageEntity): InboxMessage {
    return plainToInstance(InboxMessage, row, { excludeExtraneousValues: true });
  }
}
