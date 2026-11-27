import type { AiVoiceSession, AiVoiceUsageDelta } from '../domain/voice.types';

export const AI_VOICE_SESSIONS_REPOSITORY = 'AI_VOICE_SESSIONS_REPOSITORY';

export interface AiVoiceTotals {
  sessions: number;
  audioMs: number;
  partialAudioMs: number;
  ttsChars: number;
  turns: number;
}

export interface IAiVoiceSessionsRepository {
  create(input: {
    shopId: string;
    actorUserId: string;
    conversationId: string | null;
    expiresAt: Date;
  }): Promise<AiVoiceSession>;
  findById(id: string): Promise<AiVoiceSession | null>;
  /** Open, unexpired sessions (oldest first). */
  listOpen(filter: { actorUserId?: string; shopId?: string }, now: Date): Promise<AiVoiceSession[]>;
  totals(
    filter: { actorUserId?: string; shopId: string } | { actorUserId: string; shopId?: string },
    since: Date,
  ): Promise<AiVoiceTotals>;
  /** Atomic increments; also bumps last activity. */
  addUsage(id: string, delta: AiVoiceUsageDelta, at: Date): Promise<void>;
  setConversation(id: string, conversationId: string): Promise<void>;
  /** false when it was not open. */
  end(id: string, reason: string, at: Date): Promise<boolean>;
  expireStale(now: Date): Promise<number>;
}

/** The person's current access to a shop (role changes apply to the very next voice turn). */
export const AI_VOICE_ACCESS = 'AI_VOICE_ACCESS';
export interface IAiVoiceAccess {
  accessFor(
    actorUserId: string,
    shopId: string,
  ): Promise<{ role: string; permissions: Record<string, string> | null; isOwner: boolean } | null>;
}
