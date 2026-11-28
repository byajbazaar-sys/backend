import { Inject, Injectable } from '@nestjs/common';

import {
  KaggleAccount,
  RenderJob,
  EKaggleAccountStatus,
  ERenderJobKind,
  ERenderJobStatus,
  IKaggleAccountsRepository,
  KAGGLE_ACCOUNTS_REPOSITORY,
  IKaggleWorkerPool,
  KAGGLE_WORKER_POOL,
  IMarketingSettingsRepository,
  MARKETING_SETTINGS_REPOSITORY,
  IRenderJobsRepository,
  RENDER_JOBS_REPOSITORY,
} from '../../../shared';
import {
  isAccountCoolingDown,
  jobTarget,
  kernelSlugOf,
  KAGGLE_WORK_NOTEBOOKS,
  KaggleWorkNotebook,
  kindsOf,
  MIN_GPU_HOURS,
  minutesSince,
  notebookOf,
  STARTING_MAX_MS,
} from '../utils';
import { KaggleAccountNotebookHealth } from './kaggle-account-notebook-health';
import { KaggleHealth } from './kaggle-health';
import { KaggleHealthIssue } from './kaggle-health-issue';
import { KaggleHealthStatus } from './kaggle-health-status';
import { KaggleNotebookHealth } from './kaggle-notebook-health';
import { KagglePipelineHealth } from './kaggle-pipeline-health';
import { KaggleRecentJob } from './kaggle-recent-job';
import { KaggleWarmWorkerHealth } from './kaggle-warm-worker-health';

/** A setup notebook taking longer than this is reported as slow. */
const SETUP_SLOW_MS = 45 * 60 * 1000;
/** Renders waiting longer than this are reported as stalled. */
const QUEUE_STALLED_MS = 15 * 60 * 1000;
/** Waiting jobs listed on the admin screen. */
const WAITING_LIST_LIMIT = 20;
/** Finished jobs the pipeline summary looks at, and how many of them are listed. */
const RECENT_WINDOW = 40;
const RECENT_LIST_LIMIT = 20;

/** Everything the report is built from, read once per call. */
interface HealthSnapshot {
  configured: Set<string>;
  accounts: Map<string, KaggleAccount>;
  busy: RenderJob[];
  waitingJobs: RenderJob[];
  waiting: number;
  waitingByKind: Partial<Record<ERenderJobKind, number>>;
  finished: RenderJob[];
  autoRecover: boolean;
}

const finishedAt = (job: RenderJob): number => new Date(job.finishedAt ?? job.updatedAt ?? 0).getTime();

/**
 * Is Kaggle rendering working, and if not, why: per-account notebook state (image and video), the image / video
 * pipelines, recent runs and the issues an admin can act on. Read-only — the fixes live in MarketingRenderService.
 */
@Injectable()
export class KaggleHealthService {
  constructor(
    @Inject(RENDER_JOBS_REPOSITORY) private readonly jobs: IRenderJobsRepository,
    @Inject(KAGGLE_ACCOUNTS_REPOSITORY) private readonly accounts: IKaggleAccountsRepository,
    @Inject(KAGGLE_WORKER_POOL) private readonly pool: IKaggleWorkerPool,
    @Inject(MARKETING_SETTINGS_REPOSITORY) private readonly settings: IMarketingSettingsRepository,
  ) {}

  async report(): Promise<KaggleHealth> {
    const snapshot = await this.snapshot();
    const { issues, usable } = this.accountIssues(snapshot);
    issues.push(...this.jobIssues(snapshot, usable));
    const oldest = snapshot.waitingJobs[0]?.createdAt ?? null;
    return {
      status: this.overallStatus(snapshot, issues, usable),
      checkedAt: new Date(),
      autoRecover: snapshot.autoRecover,
      usableAccounts: usable,
      waiting: snapshot.waiting,
      oldestWaitingMinutes: oldest ? minutesSince(oldest) : null,
      notebooks: await this.accountNotebooks(snapshot),
      issues,
      waitingJobs: snapshot.waitingJobs.map((job) => ({
        id: job.id,
        kind: job.kind,
        notebook: notebookOf(job.kind),
        target: jobTarget(job),
        campaignId: job.campaignId ?? null,
        attempts: job.attempts,
        waitingMinutes: minutesSince(job.createdAt),
        stageMessage: job.stageMessage ?? null,
      })),
      pipelines: KAGGLE_WORK_NOTEBOOKS.map((notebook) => this.pipeline(snapshot, notebook)),
      recentJobs: snapshot.finished.slice(0, RECENT_LIST_LIMIT).map((job) => this.recentJob(job)),
    };
  }

  private async snapshot(): Promise<HealthSnapshot> {
    const [workers, accounts, busy, waitingJobs, waiting, waitingByKind, finished, settings] = await Promise.all([
      this.pool.workers(),
      this.accounts.list(),
      this.jobs.listBusy(),
      this.jobs.listWaiting(WAITING_LIST_LIMIT),
      this.jobs.countWaiting(),
      this.jobs.countWaitingByKind(),
      this.jobs.listRecentFinished(RECENT_WINDOW),
      this.settings.kaggle(),
    ]);
    return {
      configured: new Set(workers.map((w) => w.id)),
      accounts: new Map(accounts.map((a) => [a.username, a])),
      busy,
      waitingJobs,
      waiting,
      waitingByKind,
      finished,
      autoRecover: settings.autoRecover,
    };
  }

  // ---------------------------------------------------------------- per account

  private accountNotebooks(snapshot: HealthSnapshot): Promise<KaggleAccountNotebookHealth[]> {
    const names = new Set([...snapshot.configured, ...snapshot.accounts.keys()]);
    return Promise.all(
      [...names].map(async (username) => {
        const account = snapshot.accounts.get(username);
        const jobs = snapshot.busy.filter((job) => job.workerId === username && job.kind !== ERenderJobKind.Worker);
        const sessions = snapshot.busy.filter((job) => job.workerId === username && job.kind === ERenderJobKind.Worker);
        const [video, image, worker] = await Promise.all([
          this.notebookHealth(account, jobs, 'video'),
          this.notebookHealth(account, jobs, 'image'),
          this.warmWorker(sessions),
        ]);
        return {
          account: username,
          accountStatus: account?.status ?? 'UNCONFIGURED',
          video,
          image,
          worker,
        };
      }),
    );
  }

  /** The newest live warm session of an account (busy ones first), or null. */
  private async warmWorker(sessions: RenderJob[]): Promise<KaggleWarmWorkerHealth | null> {
    if (!sessions.length) return null;
    const rank = (s: RenderJob) =>
      s.payload.session?.state === 'busy' ? 0 : s.status === ERenderJobStatus.Running ? 1 : 2;
    const session = [...sessions].sort((a, b) => rank(a) - rank(b))[0];
    const info = session.payload.session;
    const state = session.status === ERenderJobStatus.Starting ? 'starting' : info?.state === 'busy' ? 'busy' : 'idle';
    return {
      sessions: sessions.length,
      state,
      idleMinutes: state === 'idle' && info?.idleSince ? minutesSince(new Date(info.idleSince)) : null,
      jobsRun: info?.jobsRun ?? 0,
      modelsCached: info?.modelsCached ?? null,
      hoursLeft:
        typeof info?.remainingSeconds === 'number' ? Math.round((info.remainingSeconds / 3600) * 10) / 10 : null,
      pipeline: info?.pipeline ?? null,
      kernelRef: session.kernelRef ?? null,
      startedAt: session.startedAt ?? null,
      ...(state === 'starting' ? await this.bootingWorker(session) : {}),
    };
  }

  /** A booting session: what Kaggle says about its notebook, and whether the notebook has reached the API yet. */
  private async bootingWorker(
    session: RenderJob,
  ): Promise<Pick<KaggleWarmWorkerHealth, 'kaggleState' | 'kaggleMessage' | 'reportedAt' | 'forAssistant'>> {
    const kernelName = kernelSlugOf(session.kernelRef);
    const kaggle =
      kernelName && session.workerId
        ? await this.pool.sessionStatus(session.workerId, kernelName)
        : { state: 'unknown' as const, failureMessage: undefined };
    return {
      kaggleState: kaggle.state,
      kaggleMessage: kaggle.failureMessage ?? null,
      reportedAt: session.payload.session?.reportedAt ?? null,
      forAssistant: !!session.payload.session?.forAssistant,
    };
  }

  private async notebookHealth(
    account: KaggleAccount | undefined,
    jobs: RenderJob[],
    notebook: KaggleWorkNotebook,
  ): Promise<KaggleNotebookHealth> {
    const kinds = kindsOf(notebook);
    const job = jobs.find((item) => kinds.includes(item.kind));
    if (!job) {
      const idle = isAccountCoolingDown(account ?? {}) ? 'COOLDOWN' : 'IDLE';
      return {
        jobId: null,
        status: account?.status === EKaggleAccountStatus.Ready ? idle : (account?.status ?? 'UNCONFIGURED'),
        kernelRef: null,
        progress: null,
        stageMessage: null,
        failureMessage: account?.lastError ?? null,
        target: null,
        attempts: null,
        startedAt: null,
        updatedAt: null,
      };
    }
    const kernelName = kernelSlugOf(job.kernelRef);
    const session =
      kernelName && job.workerId
        ? await this.pool.sessionStatus(job.workerId, kernelName)
        : { state: 'unknown' as const, failureMessage: undefined };
    // Kaggle's status API can be unavailable for a session that is clearly alive (it keeps sending progress):
    // fall back to what the job itself reports instead of showing "unknown".
    const fallback =
      job.status === ERenderJobStatus.Starting
        ? 'STARTING'
        : job.status === ERenderJobStatus.Running
          ? 'RUNNING'
          : null;
    const unknown = session.state === 'unknown';
    return {
      jobId: job.id,
      status: unknown && fallback ? fallback : session.state.toUpperCase(),
      kernelRef: job.kernelRef ?? null,
      progress: job.progress,
      stageMessage: job.stageMessage ?? null,
      failureMessage: unknown && fallback ? null : (session.failureMessage ?? null),
      target: jobTarget(job),
      attempts: job.attempts,
      startedAt: job.startedAt ?? null,
      updatedAt: job.updatedAt ?? null,
    };
  }

  // ---------------------------------------------------------------- issues

  /** Problems with the configured accounts, and how many of them can take a render now. */
  private accountIssues(snapshot: HealthSnapshot): { issues: KaggleHealthIssue[]; usable: number } {
    const issues: KaggleHealthIssue[] = [];
    let usable = 0;
    for (const id of snapshot.configured) {
      const { usable: canRender, issue } = this.accountState(id, snapshot.accounts.get(id));
      if (issue) issues.push(issue);
      if (canRender) usable += 1;
    }
    if (snapshot.configured.size === 0) {
      issues.unshift({
        level: 'error',
        code: 'NO_ACCOUNTS',
        message: 'No enabled Kaggle account with a readable API key — renders cannot start. Add accounts below.',
      });
    } else if (usable === 0) {
      issues.unshift({
        level: 'error',
        code: 'NO_READY_ACCOUNT',
        message: 'No Kaggle account can take renders right now (all are setting up, failed, resting or out of quota).',
      });
    }
    return { issues, usable };
  }

  /** Whether an account can render right now and, when it cannot, why. */
  private accountState(id: string, account: KaggleAccount | undefined): { usable: boolean; issue?: KaggleHealthIssue } {
    const blocked = (issue: KaggleHealthIssue) => ({ usable: false, issue });
    if (!account || account.status === EKaggleAccountStatus.New) {
      return blocked({
        level: 'info',
        code: 'SETUP_PENDING',
        account: id,
        message: `${id}: waiting for its setup to start`,
      });
    }
    if (account.status === EKaggleAccountStatus.SettingUp) {
      const minutes = minutesSince(account.setupAttemptAt);
      const slow = minutes * 60_000 > SETUP_SLOW_MS;
      return blocked({
        level: slow ? 'warning' : 'info',
        code: slow ? 'SETUP_SLOW' : 'SETTING_UP',
        account: id,
        message: `${id}: setup notebook running for ${minutes} min${slow ? ' (longer than usual)' : ''}`,
      });
    }
    if (account.status === EKaggleAccountStatus.Failed) {
      return blocked({
        level: 'error',
        code: 'ACCOUNT_FAILED',
        account: id,
        message: `${id}: setup failed — ${account.lastError ?? 'unknown error'}`,
      });
    }
    if (account.status !== EKaggleAccountStatus.Ready) return { usable: false };
    if (isAccountCoolingDown(account)) {
      return blocked({
        level: 'warning',
        code: 'ACCOUNT_COOLING',
        account: id,
        message: `${id}: resting until ${new Date(account.cooldownUntil).toISOString()} — ${
          account.lastError ?? 'could not start a notebook'
        }`,
      });
    }
    if (account.gpuHoursLeft !== null && account.gpuHoursLeft !== undefined && account.gpuHoursLeft < MIN_GPU_HOURS) {
      return blocked({
        level: 'warning',
        code: 'LOW_QUOTA',
        account: id,
        message: `${id}: only ${account.gpuHoursLeft.toFixed(1)} GPU hours left this week`,
      });
    }
    return { usable: true };
  }

  /** A stalled queue and jobs that stopped reporting. */
  private jobIssues(snapshot: HealthSnapshot, usable: number): KaggleHealthIssue[] {
    const issues: KaggleHealthIssue[] = [];
    const oldest = snapshot.waitingJobs[0]?.createdAt;
    if (snapshot.waiting > 0 && oldest && minutesSince(oldest) * 60_000 > QUEUE_STALLED_MS) {
      issues.push({
        level: usable === 0 ? 'error' : 'warning',
        code: 'QUEUE_STALLED',
        message: `${snapshot.waiting} render(s) waiting; the oldest for ${minutesSince(oldest)} min`,
      });
    }
    for (const job of snapshot.busy.filter((j) => j.kind !== ERenderJobKind.Worker)) {
      const silent = minutesSince(job.updatedAt ?? job.startedAt);
      if (silent * 60_000 <= STARTING_MAX_MS) continue;
      const neverStarted = job.status === ERenderJobStatus.Starting;
      issues.push({
        level: 'warning',
        code: neverStarted ? 'JOB_NOT_STARTED' : 'JOB_SILENT',
        account: job.workerId ?? undefined,
        jobId: job.id,
        message: `${job.kind.toLowerCase()} job on ${job.workerId ?? '?'}: no progress for ${silent} min${
          neverStarted ? ' (notebook never reported in)' : ''
        }`,
      });
    }
    return issues;
  }

  private overallStatus(snapshot: HealthSnapshot, issues: KaggleHealthIssue[], usable: number): KaggleHealthStatus {
    const hasError = issues.some((i) => i.level === 'error');
    const hasWarning = issues.some((i) => i.level === 'warning');
    if (usable === 0 && (snapshot.configured.size === 0 || snapshot.waiting > 0 || hasError)) return 'down';
    return hasError || hasWarning ? 'degraded' : 'healthy';
  }

  // ---------------------------------------------------------------- pipelines

  private pipeline(snapshot: HealthSnapshot, notebook: KaggleWorkNotebook): KagglePipelineHealth {
    const kinds = kindsOf(notebook);
    const busy = snapshot.busy.filter((job) => kinds.includes(job.kind));
    const running = busy.filter((job) => job.status === ERenderJobStatus.Running).length;
    const starting = busy.length - running;
    const waiting = kinds.reduce((sum, kind) => sum + (snapshot.waitingByKind[kind] ?? 0), 0);
    const finished = snapshot.finished.filter((job) => kinds.includes(job.kind));
    const done = finished.filter((job) => job.status === ERenderJobStatus.Done);
    const failed = finished.filter((job) => job.status === ERenderJobStatus.Failed);
    const lastSuccess = done[0];
    const lastFailure = failed[0];
    const failing = !!lastFailure && (!lastSuccess || finishedAt(lastFailure) > finishedAt(lastSuccess));
    return {
      notebook,
      state: running ? 'running' : starting ? 'starting' : waiting ? 'waiting' : failing ? 'failing' : 'idle',
      running,
      starting,
      waiting,
      lastSuccessAt: lastSuccess?.finishedAt ?? null,
      lastFailureAt: lastFailure?.finishedAt ?? null,
      lastFailure: lastFailure?.error?.slice(0, 500) ?? null,
      recentDone: done.length,
      recentFailed: failed.length,
    };
  }

  private recentJob(job: RenderJob): KaggleRecentJob {
    return {
      id: job.id,
      kind: job.kind,
      notebook: notebookOf(job.kind) === 'image' ? 'image' : 'video',
      target: jobTarget(job),
      status: job.status,
      account: job.workerId ?? null,
      attempts: job.attempts,
      durationMinutes:
        job.startedAt && job.finishedAt ? minutesSince(job.startedAt, new Date(job.finishedAt).getTime()) : null,
      error: job.error?.slice(0, 500) ?? null,
      finishedAt: job.finishedAt ?? null,
    };
  }
}
