import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  KagglePushResult,
  KaggleSessionState,
  KaggleWorker,
  IKaggleCredentialsRepository,
  KAGGLE_CREDENTIALS_REPOSITORY,
  IKaggleWorkerPool,
} from '../../application';
import { MarketingConfig } from '../../marketing.config';

/** RPC endpoints used by the official `kaggle` CLI (≥ 2.x). */
const KAGGLE_API = 'https://api.kaggle.com/v1/kernels.KernelsApiService';
const KAGGLE_KERNEL_PUSH_API = 'https://www.kaggle.com/api/v1/kernels/push';

interface KaggleAccountCredentials {
  id: string;
  key: string;
}

/** "123.5s" (protobuf Duration JSON) → seconds. */
function durationSeconds(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^[\d.]+s$/.test(value)) return Number(value.slice(0, -1));
  return null;
}

@Injectable()
/** Kaggle accounts come from kaggle_credentials (managed by admins), read on every call so changes apply at once. */
export class KaggleWorkerPool implements IKaggleWorkerPool {
  constructor(
    private readonly config: MarketingConfig,
    @Inject(KAGGLE_CREDENTIALS_REPOSITORY) private readonly credentials: IKaggleCredentialsRepository,
    @InjectPinoLogger(KaggleWorkerPool.name) private readonly logger: PinoLogger,
  ) {}

  async workers(): Promise<KaggleWorker[]> {
    const rows = await this.credentials.list({ enabled: true });
    for (const row of rows.filter((r) => !r.apiKey)) {
      this.logger.warn({ account: row.username }, 'Kaggle API key could not be decrypted — account skipped');
    }
    return rows
      .filter((r) => r.apiKey)
      .map((r) => ({ id: r.username, concurrency: Math.min(4, Math.max(1, r.concurrency || 1)) }));
  }

  private async account(workerId: string): Promise<KaggleAccountCredentials> {
    const row = await this.credentials.find(workerId);
    if (!row || !row.enabled || !row.apiKey) {
      throw new ServiceUnavailableException(`Kaggle account ${workerId} is not configured`);
    }
    return { id: row.username, key: row.apiKey };
  }

  private request(account: KaggleAccountCredentials): AxiosRequestConfig {
    const auth = account.key.startsWith('KGAT_')
      ? { headers: { Authorization: `Bearer ${account.key}`, 'Content-Type': 'application/json' } }
      : { auth: { username: account.id, password: account.key }, headers: { 'Content-Type': 'application/json' } };
    return { ...auth, timeout: 60_000, validateStatus: () => true };
  }

  async gpuQuota(workerId: string): Promise<{ hoursLeft: number | null }> {
    return this.quota(await this.account(workerId));
  }

  async verifyCredentials(username: string, apiKey: string): Promise<{ hoursLeft: number | null }> {
    return this.quota({ id: username, key: apiKey });
  }

  private async quota(account: KaggleAccountCredentials): Promise<{ hoursLeft: number | null }> {
    const workerId = account.id;
    const res = await axios.post(`${KAGGLE_API}/GetAcceleratorQuotaStatistics`, {}, this.request(account));
    if (res.status === 401 || res.status === 403) {
      throw new ServiceUnavailableException(`Kaggle rejected the credentials for ${workerId} (HTTP ${res.status})`);
    }
    if (res.status >= 300) {
      throw new ServiceUnavailableException(`Kaggle quota check failed for ${workerId} (HTTP ${res.status})`);
    }
    const gpu = (res.data as { gpuQuota?: Record<string, unknown> })?.gpuQuota ?? {};
    const total = durationSeconds(gpu.totalTimeAllowed);
    const used = durationSeconds(gpu.timeUsed) ?? 0;
    return { hoursLeft: total === null ? null : Math.max(0, (total - used) / 3600) };
  }

  async sessionStatus(
    workerId: string,
    kernelName: string,
  ): Promise<{ state: KaggleSessionState; failureMessage?: string }> {
    try {
      const account = await this.account(workerId);
      const res = await axios.post(
        `${KAGGLE_API}/GetKernelSessionStatus`,
        { userName: account.id, kernelSlug: kernelName },
        this.request(account),
      );
      if (res.status >= 300) return { state: 'unknown', failureMessage: `HTTP ${res.status}` };
      const data = (res.data ?? {}) as { status?: string; failureMessage?: string };
      // Enum names may come bare ("RUNNING") or prefixed ("KERNEL_WORKER_STATUS_RUNNING").
      const raw = String(data.status ?? 'QUEUED').toUpperCase();
      const state: KaggleSessionState = raw.includes('CANCEL')
        ? 'cancelled'
        : raw.includes('ERROR')
          ? 'error'
          : raw.includes('COMPLETE')
            ? 'complete'
            : raw.includes('RUNNING')
              ? 'running'
              : raw.includes('QUEUED') || raw.includes('NEW_SCRIPT')
                ? 'queued'
                : 'unknown';
      return { state, failureMessage: data.failureMessage ?? undefined };
    } catch (err) {
      this.logger.warn({ workerId, kernelName, err: (err as Error).message }, 'Kaggle session status check failed');
      return { state: 'unknown', failureMessage: (err as Error).message };
    }
  }

  async pushNotebook(
    workerId: string,
    kernel: { name: string; title: string },
    notebook: Record<string, unknown>,
  ): Promise<KagglePushResult> {
    const account = await this.account(workerId);
    const res = await axios.post(
      KAGGLE_KERNEL_PUSH_API,
      {
        slug: `${account.id}/${kernel.name}`,
        newTitle: kernel.title,
        text: JSON.stringify(notebook),
        language: 'python',
        kernelType: 'notebook',
        isPrivate: true,
        enableGpu: true,
        enableTpu: false,
        enableInternet: true,
        machineShape: this.config.kaggleMachineShape, // GPU T4 × 2
        datasetDataSources: [],
        kernelDataSources: [],
        competitionDataSources: [],
        modelDataSources: [],
        categoryIds: [],
      },
      this.request(account),
    );
    const data = (res.data ?? {}) as {
      ref?: string;
      url?: string;
      versionNumber?: number;
      error?: string;
      message?: string;
    };
    if (res.status >= 300 || data.error) {
      const reason = data.error || data.message || `HTTP ${res.status}`;
      this.logger.error({ workerId, kernel: kernel.name, status: res.status, reason }, 'Kaggle notebook push failed');
      throw new ServiceUnavailableException(`Kaggle push failed on ${workerId}: ${reason}`);
    }
    this.logger.info(
      { workerId, kernel: kernel.name, ref: data.ref, version: data.versionNumber },
      'Kaggle notebook pushed',
    );
    return { ref: data.ref ?? `${account.id}/${kernel.name}`, url: data.url ?? '', versionNumber: data.versionNumber };
  }
}
