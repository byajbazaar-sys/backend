import { createHmac } from 'crypto';

import { SESSION_LOST_MS, STARTING_MAX_MS } from './kaggle-rules';
import { ERenderJobStatus } from '../../../shared';

/**
 * ByajBazaar AI's voice lane on the warm workers (Backend/docs/AI_VOICE.md §2a): every warm worker also speaks the
 * assistant's Hindi replies with ChatterBox — the Voice studio's engine — over a WebSocket to the Cloudflare voice
 * gateway, outside the job queue, so the assistant never waits behind marketing work.
 *
 * The worker gets the gateway URL and a token signed with the voice ticket secret (same format the gateway checks:
 * `v1.<base64url(claims)>.<base64url(HMAC-SHA256(secret, "v1." + payload))>`, claims kind "tts-worker"). Read from
 * the AI settings (AI_VOICE_*, loaded into the environment on cold start); null when voice or the lane is off.
 */
export interface AssistantVoiceLink {
  url: string;
  token: string;
}

export function assistantVoiceLink(
  sessionId: string,
  account: string,
  sessionSeconds: number,
  now = Date.now(),
): AssistantVoiceLink | null {
  const env = (name: string): string => process.env[name]?.trim() || '';
  const gateway = env('AI_VOICE_GATEWAY_URL').replace(/\/+$/, '');
  const secret = env('AI_VOICE_TICKET_SECRET');
  if (!gateway || secret.length < 32 || env('AI_VOICE_ENABLED') === 'false' || env('AI_VOICE_KAGGLE_TTS') === 'false') {
    return null;
  }
  const claims = {
    v: 1,
    kind: 'tts-worker',
    wid: sessionId,
    acct: account.slice(0, 100),
    exp: now + (Math.max(0, sessionSeconds) + 3600) * 1000,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`v1.${payload}`).digest('base64url');
  return { url: `${gateway}/v1/tts-workers`, token: `v1.${payload}.${signature}` };
}

/** A worker reporting assistant voice demand stays "hot" this long after its last poll saying so. */
export const ASSISTANT_VOICE_HOT_MS = 2 * 60_000;

/**
 * New warm workers to start for the waiting jobs. A worker busy with the assistant's voice ("hot") only takes voice
 * jobs, so it counts as free for those and not for image / video work — marketing gets its own worker instead of
 * taking the assistant's GPU.
 */
export function workersNeeded(input: {
  waitingVoice: number;
  waitingOther: number;
  freeHot: number;
  freeCold: number;
}): number {
  const otherShort = Math.max(0, input.waitingOther - input.freeCold);
  const coldLeft = Math.max(0, input.freeCold - input.waitingOther);
  const voiceShort = Math.max(0, input.waitingVoice - input.freeHot - coldLeft);
  return otherShort + voiceShort;
}

/** The fields of a warm worker session (a WORKER render job) that say whether it can speak for the assistant. */
export interface AssistantVoiceSessionLike {
  status: ERenderJobStatus | string;
  startedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  payload: {
    session?: { state?: string; aiVoiceHotUntil?: string | null; forAssistant?: { since: string } | null } | null;
  };
}

/**
 * Warm sessions that can speak the assistant's Hindi replies: booting ones (their voice lane connects as they start)
 * and running ones that are idle or already speaking for it ("hot"). A session busy with image / video work has
 * dropped its voice engine until that job ends, and one that stopped polling (no job) is gone — neither counts, so a
 * worker is started for the assistant instead of waiting on it.
 */
export function assistantVoiceSessions<T extends AssistantVoiceSessionLike>(
  sessions: T[],
  now = Date.now(),
): { running: T[]; booting: T[] } {
  const running: T[] = [];
  const booting: T[] = [];
  for (const session of sessions) {
    const state = session.payload.session?.state;
    const silentMs = now - toMs(session.updatedAt ?? session.startedAt ?? session.createdAt, now);
    if (String(session.status) === String(ERenderJobStatus.Starting)) {
      if (silentMs <= STARTING_MAX_MS) booting.push(session);
      continue;
    }
    if (String(session.status) !== String(ERenderJobStatus.Running)) continue;
    const hot = toMs(session.payload.session?.aiVoiceHotUntil, 0) > now;
    if (state === 'busy' ? hot : silentMs <= SESSION_LOST_MS) running.push(session);
  }
  return { running, booting };
}

/**
 * When a warm session started — for one started for the assistant, when the assistant first asked (a replacement on
 * another account keeps the wait the person has already had).
 */
export function sessionStart(session: AssistantVoiceSessionLike): Date | null {
  const at = session.payload.session?.forAssistant?.since ?? session.startedAt ?? session.createdAt;
  return at ? new Date(at) : null;
}

function toMs(value: Date | string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : fallback;
}
