import { KaggleJobStatusView } from './kaggle-job-status-view';
import { KaggleNotebook } from './kaggle-notebook';
import { KaggleWorkNotebook } from './kaggle-work-notebook';
import { KaggleAccount, RenderJob, ERenderJobKind } from '../../../shared';

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

/** Short human label of what a job works on, for the admin screen ("Campaign images · Diwali set"). */
export function jobTarget(job: RenderJob): string {
  const generation = job.payload?.imageGeneration;
  if (generation) {
    const what =
      generation.type === 'logo' ? 'Logo image' : generation.type === 'photoshoot' ? 'Photoshoot' : 'Campaign images';
    const count = generation.targets?.length ?? 0;
    return `${what} · ${generation.title}${count > 1 ? ` (${count} images)` : ''}`.slice(0, 200);
  }
  if (job.kind === ERenderJobKind.Setup) return 'Account setup check';
  if (job.kind === ERenderJobKind.Logo) return 'Logo clip';
  const clips = job.payload?.clips?.length ?? 0;
  const merge = job.payload?.merge ? ' + merge' : '';
  return `Campaign video${clips ? ` (${clips} clip${clips === 1 ? '' : 's'}${merge})` : ''}`;
}
