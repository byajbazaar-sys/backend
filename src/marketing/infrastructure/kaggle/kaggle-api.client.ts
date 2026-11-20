import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { KagglePushResult, KaggleSessionState, normalizeKernelRef } from '../../application';
import { MarketingConfig } from '../../marketing.config';

/** RPC endpoints used by the official `kaggle` CLI (≥ 2.x). */
const KAGGLE_API = 'https://api.kaggle.com/v1/kernels.KernelsApiService';
const KAGGLE_KERNEL_PUSH_API = 'https://www.kaggle.com/api/v1/kernels/push';

export interface KaggleAccountCredentials {
  id: string;
  key: string;
}

/** "123.5s" (protobuf Duration JSON) → seconds. */
function durationSeconds(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^[\d.]+s$/.test(value)) return Number(value.slice(0, -1));
  return null;
}

/** The Kaggle API for one account at a time: GPU quota, notebook push (and run), session status. */
@Injectable()
export class KaggleApiClient {
  constructor(
    private readonly config: MarketingConfig,
    @InjectPinoLogger(KaggleApiClient.name) private readonly logger: PinoLogger,
  ) {}

  private request(account: KaggleAccountCredentials): AxiosRequestConfig {
    const auth = account.key.startsWith('KGAT_')
      ? { headers: { Authorization: `Bearer ${account.key}`, 'Content-Type': 'application/json' } }
      : { auth: { username: account.id, password: account.key }, headers: { 'Content-Type': 'application/json' } };
    return { ...auth, timeout: 60_000, validateStatus: () => true };
  }

  async quota(account: KaggleAccountCredentials): Promise<{ hoursLeft: number | null }> {
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
    account: KaggleAccountCredentials,
    kernelName: string,
  ): Promise<{ state: KaggleSessionState; failureMessage?: string }> {
    const workerId = account.id;
    try {
      const res = await axios.post(
        `${KAGGLE_API}/GetKernelSessionStatus`,
        { userName: account.id, kernelSlug: kernelName },
        this.request(account),
      );
      if (res.status >= 300) {
        const detail = JSON.stringify(res.data ?? '').slice(0, 300);
        this.logger.warn({ workerId, kernelName, status: res.status, detail }, 'Kaggle session status rejected');
        return { state: 'unknown', failureMessage: `Kaggle status check failed (HTTP ${res.status})` };
      }
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
    account: KaggleAccountCredentials,
    kernel: { name: string; title: string },
    notebook: Record<string, unknown>,
    datasets: string[] = [],
  ): Promise<KagglePushResult> {
    const workerId = account.id;
    let res = await this.push(account, kernel, notebook, datasets);
    const firstError = (res.data as { error?: string; message?: string } | undefined) ?? {};
    const firstReason = firstError.error || firstError.message || '';
    // Retry without the dataset only when the dataset could be the problem — not when the account is simply full.
    if (
      datasets.length &&
      (res.status >= 300 || firstError.error) &&
      !/maximum (?:batch )?gpu session count|session count of \d+ reached/i.test(firstReason)
    ) {
      // The model dataset may still be processing (or was deleted): the notebook downloads the models instead.
      this.logger.warn(
        { workerId, kernel: kernel.name, datasets, status: res.status, reason: firstReason },
        'Kaggle push with the model dataset failed — retrying without it',
      );
      res = await this.push(account, kernel, notebook, []);
    }
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
      { workerId, kernel: kernel.name, ref: data.ref, version: data.versionNumber, datasets },
      'Kaggle notebook pushed',
    );
    return {
      ref: normalizeKernelRef(data.ref) ?? `${account.id}/${kernel.name}`,
      url: data.url ?? '',
      versionNumber: data.versionNumber,
    };
  }

  private push(
    account: KaggleAccountCredentials,
    kernel: { name: string; title: string },
    notebook: Record<string, unknown>,
    datasets: string[],
  ) {
    return axios.post(
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
        datasetDataSources: datasets,
        kernelDataSources: [],
        competitionDataSources: [],
        modelDataSources: [],
        categoryIds: [],
      },
      this.request(account),
    );
  }
}
