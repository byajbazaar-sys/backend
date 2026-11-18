import { RenderJob } from '../domain';
import { ERenderJobKind } from '../enums';

/** Which Kaggle notebook runs a job: the image notebook (Qwen3-VL + RealVisXL) or the video notebook (Wan 2.2). */
export type KaggleNotebook = 'image' | 'video' | 'setup';

/** What the owner (and admins) see about one Kaggle notebook run. Account names and kernel refs stay admin-only. */
export interface KaggleJobStatusView {
  id: string;
  notebook: KaggleNotebook;
  /** WAITING (for a free GPU) / STARTING / RUNNING / DONE / FAILED. */
  status: string;
  progress: number;
  stageMessage: string | null;
  error: string | null;
  /** Automatic continuations so far (expired / crashed Kaggle sessions). */
  attempts: number;
  queuedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date | null;
}

export function notebookOf(kind: ERenderJobKind | string): KaggleNotebook {
  const value = String(kind);
  if (value === String(ERenderJobKind.Images)) return 'image';
  if (value === String(ERenderJobKind.Setup)) return 'setup';
  return 'video';
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
  return `Campaign video${clips ? ` (${clips} clip${clips === 1 ? '' : 's'}${job.payload?.merge ? ' + merge' : ''})` : ''}`;
}
