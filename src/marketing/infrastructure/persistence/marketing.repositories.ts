import { Injectable } from '@nestjs/common';
import { FindOptionsWhere, In, LessThan, Not, ObjectLiteral, Repository } from 'typeorm';

import {
  KaggleAccountEntity,
  KaggleCredentialEntity,
  MarketingBrandEntity,
  MarketingCampaignEntity,
  MarketingSceneEntity,
  RenderJobEntity,
} from './entities/marketing.entities';
import { MarketingDatabase } from './marketing-database';
import {
  KaggleAccount,
  KaggleCredential,
  MarketingBrand,
  MarketingCampaign,
  MarketingScene,
  RenderJob,
} from '../../application/domain';
import {
  BUSY_RENDER_STATUSES,
  ECampaignStatus,
  EKaggleAccountStatus,
  ERenderJobKind,
  ERenderJobStatus,
} from '../../application/enums';
import {
  IKaggleAccountsRepository,
  IKaggleCredentialsRepository,
  IMarketingBrandsRepository,
  IMarketingCampaignsRepository,
  IMarketingScenesRepository,
  IRenderJobsRepository,
} from '../../application/ports';
import { MarketingSecretCipher } from '../crypto/marketing-secret.cipher';

/** UPDATE … RETURNING through TypeORM on Postgres returns [rows, affectedCount]. */
function returnedRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as Record<string, unknown>[];
  return (Array.isArray(result) ? result : []) as Record<string, unknown>[];
}

abstract class MarketingRepositoryBase<E extends ObjectLiteral> {
  protected constructor(
    protected readonly db: MarketingDatabase,
    private readonly entity: new () => E,
  ) {}

  protected repo(): Promise<Repository<E>> {
    return this.db.repository(this.entity);
  }
}

@Injectable()
export class MarketingCampaignsRepository
  extends MarketingRepositoryBase<MarketingCampaignEntity>
  implements IMarketingCampaignsRepository
{
  constructor(db: MarketingDatabase) {
    super(db, MarketingCampaignEntity);
  }

  async create(campaign: Omit<MarketingCampaign, 'id'>): Promise<MarketingCampaign> {
    const repo = await this.repo();
    return (await repo.save(repo.create(campaign as Partial<MarketingCampaignEntity>))) as MarketingCampaign;
  }

  async findById(id: string): Promise<MarketingCampaign | null> {
    return (await (await this.repo()).findOne({ where: { id } })) as MarketingCampaign | null;
  }

  async findForUser(id: string, userId: string): Promise<MarketingCampaign | null> {
    return (await (await this.repo()).findOne({ where: { id, userId } })) as MarketingCampaign | null;
  }

  async listForUser(userId: string, limit: number): Promise<MarketingCampaign[]> {
    return (await (
      await this.repo()
    ).find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    })) as MarketingCampaign[];
  }

  async update(id: string, patch: Partial<MarketingCampaign>): Promise<MarketingCampaign | null> {
    await (await this.repo()).update({ id }, patch as Partial<MarketingCampaignEntity>);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await (await this.repo()).delete({ id });
  }

  async countActiveForUser(userId: string): Promise<number> {
    return (await this.repo()).count({
      where: {
        userId,
        status: In([ECampaignStatus.Planning, ECampaignStatus.WaitingGpu, ECampaignStatus.Rendering]),
      },
    });
  }
}

@Injectable()
export class MarketingScenesRepository
  extends MarketingRepositoryBase<MarketingSceneEntity>
  implements IMarketingScenesRepository
{
  constructor(db: MarketingDatabase) {
    super(db, MarketingSceneEntity);
  }

  async createMany(scenes: Omit<MarketingScene, 'id'>[]): Promise<MarketingScene[]> {
    const repo = await this.repo();
    return (await repo.save(scenes.map((s) => repo.create(s as Partial<MarketingSceneEntity>)))) as MarketingScene[];
  }

  async listForCampaign(campaignId: string): Promise<MarketingScene[]> {
    return (await (await this.repo()).find({ where: { campaignId }, order: { index: 'ASC' } })) as MarketingScene[];
  }

  async findByIndex(campaignId: string, index: number): Promise<MarketingScene | null> {
    return (await (await this.repo()).findOne({ where: { campaignId, index } })) as MarketingScene | null;
  }

  async update(id: string, patch: Partial<MarketingScene>): Promise<MarketingScene | null> {
    const repo = await this.repo();
    await repo.update({ id }, patch as Partial<MarketingSceneEntity>);
    return (await repo.findOne({ where: { id } })) as MarketingScene | null;
  }

  async deleteForCampaign(campaignId: string): Promise<void> {
    await (await this.repo()).delete({ campaignId });
  }
}

@Injectable()
export class MarketingBrandsRepository
  extends MarketingRepositoryBase<MarketingBrandEntity>
  implements IMarketingBrandsRepository
{
  constructor(db: MarketingDatabase) {
    super(db, MarketingBrandEntity);
  }

  async find(userId: string): Promise<MarketingBrand | null> {
    return (await (await this.repo()).findOne({ where: { userId } })) as MarketingBrand | null;
  }

  async upsert(brand: Partial<MarketingBrand> & { userId: string }): Promise<MarketingBrand> {
    const repo = await this.repo();
    const existing = await repo.findOne({ where: { userId: brand.userId } });
    if (existing) {
      await repo.update({ userId: brand.userId }, brand as Partial<MarketingBrandEntity>);
    } else {
      await repo.insert(brand as Partial<MarketingBrandEntity>);
    }
    return (await repo.findOne({ where: { userId: brand.userId } })) as MarketingBrand;
  }
}

@Injectable()
export class KaggleAccountsRepository
  extends MarketingRepositoryBase<KaggleAccountEntity>
  implements IKaggleAccountsRepository
{
  constructor(db: MarketingDatabase) {
    super(db, KaggleAccountEntity);
  }

  async list(): Promise<KaggleAccount[]> {
    return (await (await this.repo()).find({ order: { username: 'ASC' } })) as KaggleAccount[];
  }

  async find(username: string): Promise<KaggleAccount | null> {
    return (await (await this.repo()).findOne({ where: { username } })) as KaggleAccount | null;
  }

  async upsert(account: Partial<KaggleAccount> & { username: string }): Promise<KaggleAccount> {
    const repo = await this.repo();
    await repo.upsert(account as Partial<KaggleAccountEntity>, ['username']);
    return (await repo.findOne({ where: { username: account.username } })) as KaggleAccount;
  }

  async transition(username: string, from: EKaggleAccountStatus[], patch: Partial<KaggleAccount>): Promise<boolean> {
    const result = await (
      await this.repo()
    ).update(
      { username, status: In(from) } as FindOptionsWhere<KaggleAccountEntity>,
      patch as Partial<KaggleAccountEntity>,
    );
    return (result.affected ?? 0) > 0;
  }
}

@Injectable()
export class KaggleCredentialsRepository
  extends MarketingRepositoryBase<KaggleCredentialEntity>
  implements IKaggleCredentialsRepository
{
  constructor(
    db: MarketingDatabase,
    private readonly cipher: MarketingSecretCipher,
  ) {
    super(db, KaggleCredentialEntity);
  }

  /** A key that can't be decrypted (secret changed) comes back as '' so one bad row never breaks the pool. */
  private toDomain(row: KaggleCredentialEntity): KaggleCredential {
    const { apiKeyEncrypted, ...rest } = row;
    let apiKey = '';
    try {
      apiKey = this.cipher.decrypt(apiKeyEncrypted);
    } catch {
      // Left empty: the worker pool skips it and the admin list reports it as unreadable.
    }
    return { ...rest, apiKey };
  }

  async list(filter: { enabled?: boolean } = {}): Promise<KaggleCredential[]> {
    const where: FindOptionsWhere<KaggleCredentialEntity> = {};
    if (filter.enabled !== undefined) where.enabled = filter.enabled;
    const rows = await (await this.repo()).find({ where, order: { username: 'ASC' } });
    return rows.map((row) => this.toDomain(row));
  }

  async find(username: string): Promise<KaggleCredential | null> {
    const row = await (await this.repo()).findOne({ where: { username } });
    return row ? this.toDomain(row) : null;
  }

  async create(credential: Omit<KaggleCredential, 'id' | 'createdAt' | 'updatedAt'>): Promise<KaggleCredential> {
    const repo = await this.repo();
    const { apiKey, ...rest } = credential;
    const saved = await repo.save(repo.create({ ...rest, apiKeyEncrypted: this.cipher.encrypt(apiKey) }));
    return this.toDomain(saved);
  }

  async update(
    username: string,
    patch: Partial<Pick<KaggleCredential, 'apiKey' | 'concurrency' | 'enabled' | 'label'>>,
  ): Promise<KaggleCredential | null> {
    const repo = await this.repo();
    const { apiKey, ...rest } = patch;
    const changes = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Partial<KaggleCredentialEntity>;
    if (apiKey !== undefined) changes.apiKeyEncrypted = this.cipher.encrypt(apiKey);
    if (Object.keys(changes).length) await repo.update({ username }, changes);
    return this.find(username);
  }

  async delete(username: string): Promise<boolean> {
    const result = await (await this.repo()).delete({ username });
    return (result.affected ?? 0) > 0;
  }
}

@Injectable()
export class RenderJobsRepository extends MarketingRepositoryBase<RenderJobEntity> implements IRenderJobsRepository {
  constructor(db: MarketingDatabase) {
    super(db, RenderJobEntity);
  }

  async create(job: Omit<RenderJob, 'id'>): Promise<RenderJob> {
    const repo = await this.repo();
    return (await repo.save(repo.create(job as unknown as Partial<RenderJobEntity>))) as unknown as RenderJob;
  }

  async findById(id: string): Promise<RenderJob | null> {
    return (await (await this.repo()).findOne({ where: { id } })) as unknown as RenderJob | null;
  }

  async update(id: string, patch: Partial<RenderJob>): Promise<RenderJob | null> {
    await (await this.repo()).update({ id }, patch as unknown as Partial<RenderJobEntity>);
    return this.findById(id);
  }

  async countBusyByWorker(): Promise<Record<string, number>> {
    const rows = await (await this.repo())
      .createQueryBuilder('j')
      .select('j.worker_id', 'workerId')
      .addSelect('COUNT(*)', 'count')
      .where('j.status IN (:...statuses)', { statuses: BUSY_RENDER_STATUSES })
      .andWhere('j.worker_id IS NOT NULL')
      .groupBy('j.worker_id')
      .getRawMany<{ workerId: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.workerId, Number(r.count)]));
  }

  async countWaiting(): Promise<number> {
    return (await this.repo()).count({
      where: { status: ERenderJobStatus.Waiting, kind: Not(ERenderJobKind.Setup) },
    });
  }

  async busySlots(workerId: string): Promise<number[]> {
    const rows = await (
      await this.repo()
    ).find({
      select: { slot: true },
      where: { workerId, status: In(BUSY_RENDER_STATUSES), kind: Not(ERenderJobKind.Setup) },
    });
    return rows.map((r) => r.slot).filter((s): s is number => s !== null && s !== undefined);
  }

  async claimNext(workerId: string, includeWork: boolean): Promise<RenderJob | null> {
    const rows = returnedRows(
      await (
        await this.repo()
      ).query(
        `UPDATE "marketing_render_jobs"
            SET "status" = $1, "worker_id" = $2, "started_at" = now(), "updated_at" = now(),
                "progress" = 0, "stage_message" = 'Starting GPU worker'
          WHERE "id" = (
            SELECT "id" FROM "marketing_render_jobs"
             WHERE "status" = $3
               AND (("kind" = $4 AND "worker_id" = $2) OR ($5::boolean AND "kind" <> $4))
             ORDER BY ("kind" = $4) DESC, "created_at" ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING "id"`,
        [ERenderJobStatus.Starting, workerId, ERenderJobStatus.Waiting, ERenderJobKind.Setup, includeWork],
      ),
    );
    const id = rows[0]?.id as string | undefined;
    return id ? this.findById(id) : null;
  }

  async findStale(statuses: ERenderJobStatus[], olderThan: Date): Promise<RenderJob[]> {
    return (await (
      await this.repo()
    ).find({
      where: { status: In(statuses), updatedAt: LessThan(olderThan) },
    })) as unknown as RenderJob[];
  }

  async findOpenFor(filter: { campaignId?: string; userId?: string; kind?: string }): Promise<RenderJob | null> {
    const where: FindOptionsWhere<RenderJobEntity> = {
      status: In([ERenderJobStatus.Waiting, ...BUSY_RENDER_STATUSES]),
    };
    if (filter.campaignId) where.campaignId = filter.campaignId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.kind) where.kind = filter.kind;
    return (await (await this.repo()).findOne({ where, order: { createdAt: 'DESC' } })) as unknown as RenderJob | null;
  }
}
