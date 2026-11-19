import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ACTIVITY_LOGGER, EActivityLogCategory, IActivityLogger } from '../../../shared';
import { CloudflareAccount, ECloudflareAccountActivity } from '../domain';
import {
  BulkCreateCloudflareAccountResultModel,
  CloudflareAccountResponseModel,
  CloudflareAccountsSummaryResponseModel,
  CloudflareAccountVerifyResponseModel,
  CreateCloudflareAccountRequestModel,
  UpdateCloudflareAccountRequestModel,
} from '../models';
import { cloudflareAccountStatus } from '../utils';
import { CLOUDFLARE_ACCOUNT_POOL, ICloudflareAccountPool } from './i-cloudflare-account-pool';
import { CLOUDFLARE_ACCOUNTS_REPOSITORY, ICloudflareAccountsRepository } from './i-cloudflare-accounts.repository';

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

/**
 * Admin management of the Cloudflare accounts whose Workers AI runs try-on and inventory background removal. Every
 * change is written to the activity log (logs database, category CLOUDFLARE) — never the token itself.
 */
@Injectable()
export class CloudflareAccountsAdminService {
  constructor(
    @Inject(CLOUDFLARE_ACCOUNTS_REPOSITORY) private readonly accounts: ICloudflareAccountsRepository,
    @Inject(CLOUDFLARE_ACCOUNT_POOL) private readonly pool: ICloudflareAccountPool,
    @Inject(ACTIVITY_LOGGER) private readonly activity: IActivityLogger,
    @InjectPinoLogger(CloudflareAccountsAdminService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<CloudflareAccountResponseModel[]> {
    return (await this.accounts.list()).map((a) => this.view(a));
  }

  async summary(): Promise<CloudflareAccountsSummaryResponseModel> {
    return this.pool.summary();
  }

  async get(id: string): Promise<CloudflareAccountResponseModel> {
    return this.view(await this.require(id));
  }

  async create(body: CreateCloudflareAccountRequestModel): Promise<CloudflareAccountResponseModel> {
    const accountId = body.accountId.trim().toLowerCase();
    if (await this.accounts.findByAccountId(accountId)) {
      throw new ConflictException(`Cloudflare account ${accountId} is already added`);
    }
    if (!body.skipVerification) await this.verifyOrThrow(accountId, body.apiToken);
    const row = await this.accounts.create({
      accountId,
      apiToken: body.apiToken,
      label: body.label || null,
      enabled: body.enabled ?? true,
    });
    this.pool.invalidate();
    await this.log(ECloudflareAccountActivity.Added, row, { verified: !body.skipVerification });
    return this.view(row);
  }

  async bulkCreate(bodies: CreateCloudflareAccountRequestModel[]): Promise<BulkCreateCloudflareAccountResultModel[]> {
    const results: BulkCreateCloudflareAccountResultModel[] = [];
    for (const body of bodies) {
      try {
        results.push({ accountId: body.accountId, ok: true, account: await this.create(body) });
      } catch (err) {
        results.push({ accountId: body.accountId, ok: false, error: (err as Error).message });
      }
    }
    return results;
  }

  /** Copies the CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN pairs into the database (skips ones already added). */
  async importFromEnv(): Promise<BulkCreateCloudflareAccountResultModel[]> {
    const pairs = this.pool.envCredentials();
    if (!pairs.length) throw new BadRequestException('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are empty');
    return this.bulkCreate(
      pairs.map((pair, index) =>
        Object.assign(new CreateCloudflareAccountRequestModel(), {
          accountId: pair.accountId.toLowerCase(),
          apiToken: pair.apiToken,
          label: `Imported from env #${index + 1}`,
        }),
      ),
    );
  }

  async update(id: string, body: UpdateCloudflareAccountRequestModel): Promise<CloudflareAccountResponseModel> {
    const existing = await this.require(id);
    const tokenChanged = body.apiToken !== undefined && body.apiToken !== existing.apiToken;
    if (tokenChanged && !body.skipVerification) await this.verifyOrThrow(existing.accountId, body.apiToken);
    const updated = await this.accounts.update(id, {
      apiToken: tokenChanged ? body.apiToken : undefined,
      label: body.label === undefined ? undefined : body.label || null,
      enabled: body.enabled,
      // A new token gets a fresh start.
      ...(tokenChanged ? { cooldownUntil: null, lastError: null } : {}),
    });
    if (!updated) throw new NotFoundException(`Cloudflare account ${id} not found`);
    this.pool.invalidate();
    await this.log(ECloudflareAccountActivity.Updated, updated, {
      tokenChanged,
      enabled: updated.enabled,
      labelChanged: body.label !== undefined,
    });
    return this.view(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.require(id);
    await this.accounts.delete(id);
    this.pool.invalidate();
    await this.log(ECloudflareAccountActivity.Removed, existing);
  }

  async verify(id: string): Promise<CloudflareAccountVerifyResponseModel> {
    const row = await this.require(id);
    if (!row.apiToken) return { id, valid: false, error: 'No token stored — re-enter it' };
    const check = await this.pool.verify(row.accountId, row.apiToken);
    await this.accounts.update(id, { lastError: check.valid ? null : (check.error ?? 'Token rejected') });
    this.pool.invalidate();
    await this.log(ECloudflareAccountActivity.Verified, row, { valid: check.valid, error: check.error });
    return { id, valid: check.valid, error: check.error };
  }

  async clearCooldown(id: string): Promise<CloudflareAccountResponseModel> {
    await this.require(id);
    const updated = await this.accounts.update(id, { cooldownUntil: null, lastError: null });
    this.pool.invalidate();
    await this.log(ECloudflareAccountActivity.CooldownCleared, updated);
    return this.view(updated);
  }

  private async verifyOrThrow(accountId: string, apiToken: string): Promise<void> {
    const check = await this.pool.verify(accountId, apiToken);
    if (!check.valid) {
      throw new BadRequestException(`Cloudflare rejected the token for ${accountId}: ${check.error ?? 'invalid'}`);
    }
  }

  private async require(id: string): Promise<CloudflareAccount> {
    const row = await this.accounts.find(id);
    if (!row) throw new NotFoundException(`Cloudflare account ${id} not found`);
    return row;
  }

  private view(account: CloudflareAccount): CloudflareAccountResponseModel {
    return {
      id: account.id,
      label: account.label,
      accountId: account.accountId,
      maskedToken: maskToken(account.apiToken),
      tokenReadable: Boolean(account.apiToken),
      enabled: account.enabled,
      status: cloudflareAccountStatus(account),
      cooldownUntil: account.cooldownUntil,
      lastError: account.lastError,
      lastUsedAt: account.lastUsedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private async log(
    action: ECloudflareAccountActivity,
    account: CloudflareAccount,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    this.logger.info({ action, account: account.accountId, ...data }, 'Cloudflare account change');
    await this.activity.record({
      category: EActivityLogCategory.Cloudflare,
      action,
      entityType: 'cloudflare_account',
      entityId: account.id,
      data: { accountId: account.accountId, label: account.label, ...data },
    });
  }
}
