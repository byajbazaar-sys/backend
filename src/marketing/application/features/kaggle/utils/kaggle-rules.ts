import { KaggleJobStatusView } from './kaggle-job-status-view';
import { KaggleNotebook } from './kaggle-notebook';
import { KaggleWorkNotebook } from './kaggle-work-notebook';
import { KaggleAccount, KaggleSessionState, RenderJob, ERenderJobKind, ERenderJobStatus } from '../../../shared';

/**
 * Pure Kaggle rules shared by dispatch (MarketingRenderService), the health report (KaggleHealthService) and the
 * campaign / photoshoot views: limits, account availability and the read model of one notebook run.
 */

/** Accounts with less GPU quota left than this are skipped. */
export const MIN_GPU_HOURS = 1;
/** Pushed but the notebook never reported in this long → it is treated as stuck. */
export const STARTING_MAX_MS = 25 * 60 * 1000;
/** A running warm session that has not polled for this long (and runs no job) has stopped. */
export const SESSION_LOST_MS = 5 * 60 * 1000;

/** A booting warm session is checked with Kaggle this often (the first time this long after the push). */
export const BOOT_CHECK_MS = 3 * 60 * 1000;
/** Kaggle kept a booting session queued this long → the account gets no GPU now: it rests, another account starts. */
export const BOOT_QUEUED_MAX_MS = 8 * 60 * 1000;
/** Kaggle runs the notebook, but it never reached ByajBazaar in this long → it cannot (no internet on the account). */
export const BOOT_SILENT_MAX_MS = 10 * 60 * 1000;

export type BootCheck = { stuck: false } | { stuck: true; reason: string; rest: boolean };

/**
 * Is a warm session that has not reported "ready" stuck? From Kaggle's session state and whether the notebook ever
 * reached the API. `rest`: the account should get no new notebooks for a while (the next one goes elsewhere). A
 * notebook reports in within about a minute of Kaggle running it, so waiting the full STARTING_MAX_MS only makes
 * sense when Kaggle's state is unknown.
 */
export function bootCheck(input: {
  ageMs: number;
  reported: boolean;
  state: KaggleSessionState | null;
  failureMessage?: string | null;
}): BootCheck {
  const { ageMs, reported, state } = input;
  const stuck = (reason: string, rest = true): BootCheck => ({ stuck: true, reason, rest });
  // Right after a push Kaggle can still report the previous version's state: judge it only from the first check on.
  if (ageMs >= BOOT_CHECK_MS) {
    if (state === 'error') {
      const detail = input.failureMessage?.trim();
      return stuck(`Kaggle stopped the notebook with an error${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    if (state === 'cancelled') return stuck('The Kaggle session was cancelled', false);
    if (state === 'complete') {
      return stuck(reported ? 'The notebook stopped while booting' : 'The notebook ended without reaching ByajBazaar');
    }
    if (state === 'queued' && ageMs >= BOOT_QUEUED_MAX_MS) {
      return stuck('Kaggle kept the session queued (no GPU free on the account)');
    }
    if (state === 'running' && !reported && ageMs >= BOOT_SILENT_MAX_MS) {
      return stuck(
        'Kaggle runs the notebook but it never reached ByajBazaar (is internet on for the account — phone verified?)',
      );
    }
  }
  if (ageMs >= STARTING_MAX_MS) return stuck('The warm GPU worker never reported in', state !== 'unknown' && !!state);
  return { stuck: false };
}

export function notebookOf(kind: ERenderJobKind | string): KaggleNotebook {
  const value = String(kind);
  if (value === String(ERenderJobKind.Images)) return 'image';
  if (value === String(ERenderJobKind.Setup)) return 'setup';
  if (value === String(ERenderJobKind.Voice)) return 'voice';
  return 'video';
}

/** Render job kinds each work notebook runs. */
export function kindsOf(notebook: KaggleWorkNotebook): ERenderJobKind[] {
  if (notebook === 'image') return [ERenderJobKind.Images];
  if (notebook === 'voice') return [ERenderJobKind.Voice];
  return [ERenderJobKind.Campaign, ERenderJobKind.Logo];
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

/** Kaggle runs at most this many GPU sessions at once per account (setup, cache builds and workers included). */
export const KAGGLE_MAX_GPU_SESSIONS = 2;

/**
 * Kaggle refused a push because the account already runs its maximum GPU sessions. Not an account fault: often a
 * session we just closed is still shutting down on Kaggle's side. Retry later instead of resting the account.
 */
export function isSessionLimitError(message?: string | null): boolean {
  return !!message && /maximum (?:batch )?gpu session count|session count of \d+ reached/i.test(message);
}

/** Parallel notebooks an account can actually run: its configured slots, capped at Kaggle's session limit. */
export function effectiveConcurrency(concurrency: number): number {
  return Math.max(1, Math.min(concurrency || 1, KAGGLE_MAX_GPU_SESSIONS));
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
    workerId: job.workerId ?? null,
    kernelRef: job.kernelRef ?? null,
  };
}

/**
 * One notebook status for a batch of jobs queued together (one per scene / shot / clip, running in parallel on
 * several accounts): the most active state, the average progress, and "2/4 done · <what the busiest one does>".
 */
export function kaggleBatchStatus(all: RenderJob[]): KaggleJobStatusView | undefined {
  // A job rendered inside another one (payload.mergedInto) is not separate work: that job's status covers it.
  const live = all.filter((job) => !job.payload?.mergedInto);
  const jobs = live.length ? live : all;
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
    workerId: (active ?? views[views.length - 1]).workerId ?? null,
    kernelRef: (active ?? views[views.length - 1]).kernelRef ?? null,
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
  if (job.kind === ERenderJobKind.Voice) return 'Voiceover';
  const clips = job.payload?.clips ?? [];
  if (clips.length === 1) return `Campaign video · ${clips[0].key} clip`;
  return `Campaign video${clips.length ? ` (${clips.length} clips)` : ''}`;
}
