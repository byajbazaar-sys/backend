import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Paged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  EInboxChannel,
  EInboxConversationState,
  IInboxConversationsRepository,
  InboxConversation,
  InboxConversationsFilter,
} from '../../../application';
import { InboxConversationEntity } from '../entities';

@Injectable()
export class InboxConversationsRepository implements IInboxConversationsRepository {
  constructor(@InjectRepository(InboxConversationEntity) private readonly repo: Repository<InboxConversationEntity>) {}

  async findOrCreate(
    userId: string,
    channel: EInboxChannel,
    externalUserId: string,
    customerName?: string | null,
  ): Promise<InboxConversation> {
    const where = { userId, channel, externalUserId };
    const existing = await this.repo.findOne({ where });
    if (existing) {
      if (customerName && !existing.customerName) {
        existing.customerName = customerName.slice(0, 255);
        await this.repo.update(existing.id, { customerName: existing.customerName });
      }
      return this.toDomain(existing);
    }
    // Two webhook deliveries can race on a first message: the unique index keeps one row, the loser re-reads it.
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(InboxConversationEntity)
      .values({ ...where, customerName: customerName?.slice(0, 255) ?? null, state: EInboxConversationState.Auto })
      .orIgnore()
      .execute();
    return this.toDomain(await this.repo.findOneOrFail({ where }));
  }

  async findById(id: string): Promise<InboxConversation | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findForUser(id: string, userId: string): Promise<InboxConversation | null> {
    const row = await this.repo.findOne({ where: { id, userId } });
    return row ? this.toDomain(row) : null;
  }

  async update(id: string, patch: Partial<InboxConversation>): Promise<InboxConversation> {
    const rest: Partial<InboxConversation> = { ...patch };
    for (const key of ['id', 'userId', 'createdAt', 'updatedAt'] as const) delete rest[key];
    if (Object.keys(rest).length) await this.repo.update(id, rest as Partial<InboxConversationEntity>);
    return this.toDomain(await this.repo.findOneOrFail({ where: { id } }));
  }

  async list(filter: InboxConversationsFilter): Promise<Paged<InboxConversation>> {
    const query = this.repo.createQueryBuilder('c').where('c.user_id = :userId', { userId: filter.userId });
    if (filter.state) query.andWhere('c.state = :state', { state: filter.state });
    if (filter.channel) query.andWhere('c.channel = :channel', { channel: filter.channel });
    const [rows, totalCount] = await query
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.created_at', 'DESC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();
    const totalPages = Math.max(1, Math.ceil(totalCount / filter.pageSize));
    return {
      items: rows.map((row) => this.toDomain(row)),
      page: filter.page,
      perPage: filter.pageSize,
      totalCount,
      totalPages,
      hasNextPage: filter.page < totalPages,
      hasPreviousPage: filter.page > 1,
    };
  }

  countNeedingReply(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, state: EInboxConversationState.NeedsReply } });
  }

  async countUnread(userId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.unread_count), 0)', 'total')
      .where('c.user_id = :userId', { userId })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private toDomain(row: InboxConversationEntity): InboxConversation {
    return plainToInstance(InboxConversation, row, { excludeExtraneousValues: true });
  }
}
