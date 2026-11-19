import { KaggleJobStatusView } from './kaggle-job-status-view';
import { KaggleNotebook } from './kaggle-notebook';
import { KaggleWorkNotebook } from './kaggle-work-notebook';
import { KaggleAccount, RenderJob, ERenderJobKind, ERenderJobStatus } from '../../../shared';

/**
 * Pure Kaggle rules shared by dispatch (MarketingRenderService), the health report (KaggleHealthService) and the
 * campaign / photoshoot views: limits, account availability and the read model of one notebook run.
 */

/** Accounts with less GPU quota left than this are skipped. */
export const MIN_GPU_HOURS = 1;
/** Pushed but the notebook never reported in this long → it is treated as stuck. */
export const STARTING_MAX_MS = 25 * 60 * 1000;

export function notebookOf(kind: ERenderJobKind | string): KaggleNotebook {
  const value = String(kind);
  if (value === String(ERenderJobKind.Images)) return 'image';
  if (value === String(ERenderJobKind.Setup)) return 'setup';
  return 'video';
}

/** Render job kinds each work notebook runs. */
export function kindsOf(notebook: KaggleWorkNotebook): ERenderJobKind[] {
  return notebook === 'image' ? [ERenderJobKind.Images] : [ERenderJobKind.Campaign, ERenderJobKind.Logo];
}

/**
 * Kernel slug ("byajbazaar-image-ab12cd34") from a stored kernel ref. Kaggle has returned refs as "user/slug",
 * "/user/slug" and "/code/user/slug" — taking the second path segment sent the user name (or "code") as the slug,
 * so every session-status check failed with HTTP 403.
 */
export function kernelSlugOf(ref?: string | null): string | null {
  const parts = String(ref ?? '')
    .replace(/^https?:\/\/[^/]+/, '')
    .split('/')
    .filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

/** "user/slug" form of a kernel ref, for storage and links. */
export function normalizeKernelRef(ref?: string | null): string | null {
  const parts = String(ref ?? '')
    .replace(/^https?:\/\/[^/]+/, '')
    .split('/')
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : null;
}

export function isAccountCoolingDown(account: Pick<KaggleAccount, 'cooldownUntil'>): boolean {
  return !!account.cooldownUntil && new Date(account.cooldownUntil).getTime() > Date.now();
}

/** Whole minutes from `from` to `to` (now by default); 0 when `from` is unknown. */
export function minutesSince(from?: Date | null, to: number = Date.now()): number {
  return from ? Math.max(0, Math.round((to - new Date(from).getTime()) / 60_000)) : 0;
}

export function kaggleJobStatus(job: RenderJob): KaggleJobStatusView {
  return {
    id: job.id,
    notebook: notebookOf(job.kind),
    status: job.status,
    progress: Math.max(0, Math.min(100, Math.round(job.progress ?? 0))),
    stageMessage: job.stageMessage ?? null,
    error: job.error ?? null,
    attempts: job.attempts ?? 0,
    queuedAt: job.createdAt ?? null,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    updatedAt: job.updatedAt ?? new Date(),
  };
}

/**
 * One notebook status for a batch of jobs queued together (one per scene / shot / clip, running in parallel on
 * several accounts): the most active state, the average progress, and "2/4 done · <what the busiest one does>".
 */
export function kaggleBatchStatus(jobs: RenderJob[]): KaggleJobStatusView | undefined {
  if (!jobs.length) return undefined;
  if (jobs.length === 1) return kaggleJobStatus(jobs[0]);
  const views = jobs.map(kaggleJobStatus);
  const is = (status: string) => (view: KaggleJobStatusView) => String(view.status) === status;
  const done = views.filter(is(ERenderJobStatus.Done)).length;
  const failed = views.filter(is(ERenderJobStatus.Failed)).length;
  const active =
    views.find(is(ERenderJobStatus.Running)) ??
    views.find(is(ERenderJobStatus.Starting)) ??
    views.find(is(ERenderJobStatus.Waiting));
  const finished = done + failed === views.length;
  const status = active?.status ?? (done > 0 ? ERenderJobStatus.Done : ERenderJobStatus.Failed);
  const progress = Math.round(
    views.reduce((sum, view) => sum + (is(ERenderJobStatus.Done)(view) ? 100 : view.progress), 0) / views.length,
  );
  const times = (pick: (view: KaggleJobStatusView) => Date | null | undefined) =>
    views
      .map(pick)
      .filter((value): value is Date => !!value)
      .map((value) => new Date(value).getTime());
  const started = times((view) => view.startedAt);
  const queued = times((view) => view.queuedAt);
  const ended = times((view) => view.finishedAt);
  const updated = times((view) => view.updatedAt);
  return {
    id: (active ?? views[views.length - 1]).id,
    notebook: views[0].notebook,
    status,
    progress: finished ? 100 : Math.min(99, progress),
    stageMessage: [`${done}/${views.length} done`, active?.stageMessage].filter(Boolean).join(' · ').slice(0, 250),
    error: failed ? (views.find((view) => view.error)?.error ?? null) : null,
    attempts: Math.max(...views.map((view) => view.attempts)),
    queuedAt: queued.length ? new Date(Math.min(...queued)) : null,
    startedAt: started.length ? new Date(Math.min(...started)) : null,
    finishedAt: finished && ended.length ? new Date(Math.max(...ended)) : null,
    updatedAt: new Date(Math.max(...updated, 0)),
  };
}

/** Short human label of what a job works on, for the admin screen ("Campaign images · Diwali set"). */
export function jobTarget(job: RenderJob): string {
  const generation = job.payload?.imageGeneration;
  if (generation) {
    const what =
      generation.type === 'logo' ? 'Logo image' : generation.type === 'photoshoot' ? 'Photoshoot' : 'Campaign images';
    const targets = generation.targets ?? [];
    const which =
      targets.length > 1
        ? ` (${targets.length} images)`
        : targets.length === 1 && generation.type !== 'logo'
          ? ` · #${targets[0].index + 1}`
          : '';
    return `${what} · ${generation.title}${which}`.slice(0, 200);
  }
  if (job.kind === ERenderJobKind.Setup) return 'Account setup check';
  if (job.kind === ERenderJobKind.Worker) return 'Warm GPU worker';
  if (job.kind === ERenderJobKind.Logo) return 'Logo clip';
  const clips = job.payload?.clips ?? [];
  if (!clips.length && job.payload?.merge) return 'Campaign video · merge';
  if (clips.length === 1) return `Campaign video · ${clips[0].key} clip${job.payload?.merge ? ' + merge' : ''}`;
  const merge = job.payload?.merge ? ' + merge' : '';
  return `Campaign video${clips.length ? ` (${clips.length} clips${merge})` : ''}`;
}
