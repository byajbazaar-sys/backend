import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CloudflareAccount,
  CloudflareAccountChanges,
  CloudflareAccountCreate,
  ICloudflareAccountsRepository,
} from '../../../application';
import { CloudflareAccountEntity } from '../entities';

/** cloudflare_accounts. API tokens are stored as plain text. */
@Injectable()
export class CloudflareAccountsRepository implements ICloudflareAccountsRepository {
  constructor(@InjectRepository(CloudflareAccountEntity) private readonly repo: Repository<CloudflareAccountEntity>) {}

  async list(): Promise<CloudflareAccount[]> {
    return (await this.repo.find({ order: { createdAt: 'ASC' } })).map((e) => this.toDomain(e));
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  async find(id: string): Promise<CloudflareAccount | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByAccountId(accountId: string): Promise<CloudflareAccount | null> {
    const entity = await this.repo.findOne({ where: { accountId: accountId.trim().toLowerCase() } });
    return entity ? this.toDomain(entity) : null;
  }

  async create(account: CloudflareAccountCreate): Promise<CloudflareAccount> {
    const saved = await this.repo.save(this.repo.create({ ...account, accountId: account.accountId.toLowerCase() }));
    return this.toDomain(saved);
  }

  async update(id: string, changes: CloudflareAccountChanges): Promise<CloudflareAccount | null> {
    const patch: Partial<CloudflareAccountEntity> = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(patch).length) await this.repo.update({ id }, patch);
    return this.find(id);
  }

  async delete(id: string): Promise<boolean> {
    return ((await this.repo.delete({ id })).affected ?? 0) > 0;
  }

  private toDomain(entity: CloudflareAccountEntity): CloudflareAccount {
    return {
      id: entity.id,
      label: entity.label,
      accountId: entity.accountId,
      apiToken: entity.apiToken ?? '',
      enabled: entity.enabled,
      cooldownUntil: entity.cooldownUntil,
      lastError: entity.lastError,
      lastUsedAt: entity.lastUsedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
