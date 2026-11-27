import { createHmac } from 'crypto';

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
