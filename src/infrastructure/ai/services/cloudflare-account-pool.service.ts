import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  ACTIVITY_LOGGER,
  CLOUDFLARE_ACCOUNTS_REPOSITORY,
  CloudflareAccount,
  CloudflarePoolSummary,
  CloudflareTokenCheck,
  cloudflareAccountStatus,
  EActivityLogCategory,
  ECloudflareAccountActivity,
  IActivityLogger,
  ICloudflareAccountPool,
  ICloudflareAccountsRepository,
} from '../../../application';
import { resolveCloudflareTryOnModelId } from '../ai.constants';
import { CloudflareTryOnOptions, type CloudflareCredential } from '../cloudflare-try-on.options';
import type { CloudflareCallInfo, CloudflareFailureInfo } from '../interfaces';

/** How long a server trusts its copy of cloudflare_accounts (admin changes on this server apply at once). */
const CACHE_MS = 30_000;
/** A rejected token (401/403) is retried after this long. */
const AUTH_COOLDOWN_MS = 60 * 60_000;

/** Workers AI's free allocation resets at 00:00 UTC. */
function nextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/**
 * The Cloudflare accounts Workers AI calls rotate over: the accounts added in admin (cloudflare_accounts), or — while
 * none is added — the CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN pairs. Each request starts on the next account
 * (round robin, so the daily free allocations are used evenly); an account whose quota is used up sits out until
 * 00:00 UTC, one whose token is rejected for an hour. Every call is written to the activity log (logs database).
 */
@Injectable()
export class CloudflareAccountPool implements ICloudflareAccountPool {
  private cache: { at: number; rows: CloudflareAccount[]; total: number } | null = null;
  private loading: Promise<{ rows: CloudflareAccount[]; total: number }> | null = null;
  private readonly envCooldown = new Map<string, number>();
  private pointer = 0;

  constructor(
    private readonly options: CloudflareTryOnOptions,
    @Inject(CLOUDFLARE_ACCOUNTS_REPOSITORY) private readonly accounts: ICloudflareAccountsRepository,
    @Inject(ACTIVITY_LOGGER) private readonly activity: IActivityLogger,
    @InjectPinoLogger(CloudflareAccountPool.name) private readonly logger: PinoLogger,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  /** The accounts to try for one request, in order (starts one further each time). Throws when none can be used. */
  async credentials(): Promise<CloudflareCredential[]> {
    const { rows, total } = await this.load();
    let list: CloudflareCredential[];
    if (total > 0) {
      list = rows
        .filter((row) => cloudflareAccountStatus(row) === 'ACTIVE')
        .map((row) => ({ id: row.id, label: row.label, accountId: row.accountId, apiToken: row.apiToken }));
      if (!list.length) throw new BadRequestException(this.unavailableMessage(rows));
    } else {
      const env = this.options.credentials.filter((c) => c.accountId.trim() && c.apiToken.trim());
      if (!env.length) {
        throw new BadRequestException(
          'Cloudflare Workers AI is not configured: add a Cloudflare account in Admin → Cloudflare accounts',
        );
      }
      const now = Date.now();
      list = env.filter((c) => (this.envCooldown.get(this.envKey(c)) ?? 0) <= now);
      if (!list.length) {
        throw new BadRequestException(
          "All Cloudflare accounts have used today's free Workers AI quota. Add another account in Admin → Cloudflare accounts, or try again after 00:00 UTC.",
        );
      }
    }
    const start = this.pointer++ % list.length;
    return [...list.slice(start), ...list.slice(0, start)];
  }

  /** Never throws and never delays the caller. */
  reportSuccess(credential: CloudflareCredential, info: CloudflareCallInfo): void {
    void this.safely(async () => {
      if (credential.id) {
        const cached = this.cache?.rows.find((row) => row.id === credential.id);
        const now = new Date();
        if (cached) cached.lastUsedAt = now;
        await this.accounts.update(credential.id, {
          lastUsedAt: now,
          ...(cached?.lastError ? { lastError: null } : {}),
        });
        if (cached) cached.lastError = null;
      }
      await this.log(ECloudflareAccountActivity.CallSucceeded, credential, { ...info });
    });
  }

  /** Never throws and never delays the caller. */
  reportFailure(credential: CloudflareCredential, info: CloudflareFailureInfo): void {
    const auth = info.status === 401 || info.status === 403;
    const cooldownUntil = info.quota ? nextUtcMidnight() : auth ? new Date(Date.now() + AUTH_COOLDOWN_MS) : null;
    const lastError = info.message.slice(0, 500);
    void this.safely(async () => {
      if (credential.id) {
        const cached = this.cache?.rows.find((row) => row.id === credential.id);
        if (cached) {
          cached.lastError = lastError;
          if (cooldownUntil) cached.cooldownUntil = cooldownUntil;
        }
        await this.accounts.update(credential.id, { lastError, ...(cooldownUntil ? { cooldownUntil } : {}) });
      } else if (cooldownUntil) {
        this.envCooldown.set(this.envKey(credential), cooldownUntil.getTime());
      }
      await this.log(ECloudflareAccountActivity.CallFailed, credential, { ...info, message: lastError });
      if (cooldownUntil) {
        this.logger.warn(
          { accountId: credential.accountId, label: credential.label, cooldownUntil, reason: lastError },
          'Cloudflare account taken out of rotation',
        );
        await this.log(ECloudflareAccountActivity.CoolingDown, credential, {
          cooldownUntil: cooldownUntil.toISOString(),
          reason: info.quota ? 'daily quota used up' : 'token rejected',
        });
      }
    });
  }

  async verify(accountId: string, apiToken: string): Promise<CloudflareTokenCheck> {
    try {
      const response = await axios.get<{ success?: boolean; errors?: { message?: string }[] }>(
        `https://api.cloudflare.com/client/v4/accounts/${accountId.trim()}/ai/models/search`,
        {
          params: { per_page: 1 },
          headers: { Authorization: `Bearer ${apiToken.trim()}` },
          timeout: 15_000,
          validateStatus: () => true,
        },
      );
      if (response.status >= 200 && response.status < 300 && response.data?.success !== false) return { valid: true };
      const message = response.data?.errors?.[0]?.message || `HTTP ${response.status}`;
      return { valid: false, error: `${message} (the token needs Workers AI permission on this account)` };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }

  async summary(): Promise<CloudflarePoolSummary> {
    const { rows, total } = await this.load(true);
    const envAccounts = this.options.credentials.length;
    const model = resolveCloudflareTryOnModelId(undefined, this.options.modelId);
    if (total > 0) {
      const activeAccounts = rows.filter((row) => cloudflareAccountStatus(row) === 'ACTIVE').length;
      return { source: 'database', activeAccounts, envAccounts, model };
    }
    const now = Date.now();
    const activeAccounts = this.options.credentials.filter(
      (c) => (this.envCooldown.get(this.envKey(c)) ?? 0) <= now,
    ).length;
    return { source: envAccounts ? 'env' : 'none', activeAccounts, envAccounts, model };
  }

  envCredentials(): { accountId: string; apiToken: string }[] {
    return this.options.credentials
      .filter((c) => c.accountId.trim() && c.apiToken.trim())
      .map((c) => ({ accountId: c.accountId.trim(), apiToken: c.apiToken.trim() }));
  }

  private load(fresh = false): Promise<{ rows: CloudflareAccount[]; total: number }> {
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return Promise.resolve(this.cache);
    this.loading ??= (async () => {
      try {
        const rows = await this.accounts.list();
        this.cache = { at: Date.now(), rows, total: rows.length };
      } catch (err) {
        // Table missing (migration not run yet) or the database is down: fall back to the env accounts.
        this.logger.warn({ err }, 'Could not read cloudflare_accounts; using CLOUDFLARE_API_TOKEN accounts');
        this.cache = { at: Date.now(), rows: [], total: 0 };
      } finally {
        this.loading = null;
      }
      return this.cache;
    })();
    return this.loading;
  }

  private unavailableMessage(rows: CloudflareAccount[]): string {
    const statuses = rows.map((row) => cloudflareAccountStatus(row));
    if (statuses.every((s) => s === 'DISABLED' || s === 'NO_TOKEN')) {
      return 'No Cloudflare account is enabled: turn one on in Admin → Cloudflare accounts';
    }
    const next = rows
      .map((row) => row.cooldownUntil?.getTime() ?? 0)
      .filter((t) => t > Date.now())
      .sort((a, b) => a - b)[0];
    const when = next ? ` (the first one is back at ${new Date(next).toISOString()})` : '';
    return `All Cloudflare accounts are resting: today's free Workers AI quota is used up or their tokens were rejected${when}. Add another account in Admin → Cloudflare accounts.`;
  }

  private envKey(credential: CloudflareCredential): string {
    return `${credential.accountId.trim()}:${credential.apiToken.trim().slice(-8)}`;
  }

  private async log(
    action: ECloudflareAccountActivity,
    credential: CloudflareCredential,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.activity.record({
      category: EActivityLogCategory.Cloudflare,
      action,
      entityType: 'cloudflare_account',
      entityId: credential.id ?? `env:${credential.accountId.trim()}`,
      data: {
        accountId: credential.accountId.trim(),
        label: credential.label ?? null,
        source: credential.id ? 'database' : 'env',
        ...data,
      },
    });
  }

  private async safely(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.logger.warn({ err }, 'Could not record Cloudflare account usage');
    }
  }
}
