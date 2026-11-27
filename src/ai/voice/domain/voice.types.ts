/**
 * ByajBazaar AI — voice. Audio never reaches this API: the Cloudflare voice gateway (cloudflare/voice-gateway) runs
 * speech-to-text and text-to-speech on Workers AI and sends this API only the transcript of each turn. This side
 * owns sessions (who may talk, for how long), the turn itself (through the existing orchestrator) and usage.
 */

/** Version of the app ⇄ gateway WebSocket protocol (cloudflare/voice-gateway/src/protocol.ts). */
export const VOICE_PROTOCOL = 'bb.voice.v1';

/** Aura-2 English voices offered in the apps (all are valid @cf/deepgram/aura-2-en speakers). */
export const VOICE_SPEAKERS = ['asteria', 'luna', 'athena', 'helena', 'orion', 'arcas', 'apollo', 'zeus'] as const;
export type VoiceSpeaker = (typeof VOICE_SPEAKERS)[number];

/** Speech-to-text language hint (Whisper). auto = detect per utterance (Hindi, English, Hinglish, Gujarati, Marathi). */
export const VOICE_SPEECH_LANGUAGES = ['auto', 'en', 'hi', 'gu', 'mr'] as const;
export type VoiceSpeechLanguage = (typeof VOICE_SPEECH_LANGUAGES)[number];

/** Previews a person may confirm by saying "confirm". Money (loans, payments, deposits) always needs a tap. */
export const VOICE_CONFIRMABLE_ACTIONS = new Set(['inventory.create', 'inventory.update', 'customers.create']);

export interface AiVoiceSession {
  id: string;
  shopId: string;
  actorUserId: string;
  conversationId: string | null;
  status: 'open' | 'ended';
  endReason: string | null;
  createdAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  lastActivityAt: Date | null;
  /** Speech the person sent (what Whisper transcribed), in milliseconds. Counts toward the daily limit. */
  audioMs: number;
  /** Audio re-transcribed for live partial transcripts (cost only). */
  partialAudioMs: number;
  sttRequests: number;
  sttLatencyMs: number;
  sttErrors: number;
  ttsChars: number;
  ttsRequests: number;
  ttsLatencyMs: number;
  ttsErrors: number;
  turns: number;
}

export type AiVoiceUsageDelta = Partial<
  Pick<
    AiVoiceSession,
    | 'audioMs'
    | 'partialAudioMs'
    | 'sttRequests'
    | 'sttLatencyMs'
    | 'sttErrors'
    | 'ttsChars'
    | 'ttsRequests'
    | 'ttsLatencyMs'
    | 'ttsErrors'
    | 'turns'
  >
>;

/**
 * Signed by this API, checked by the gateway (on connect) and by this API again (on every turn). Short-lived for
 * connecting (cexp, 2 minutes); the session itself ends at sexp. Shop and person come from the authenticated request
 * that created the session — never from the app or the gateway.
 */
export interface VoiceTicketClaims {
  v: 1;
  sid: string;
  shop: string;
  act: string;
  /** Connect by (epoch ms). */
  cexp: number;
  /** Session ends (epoch ms). */
  sexp: number;
}

export interface VoiceSessionGrant {
  sessionId: string;
  protocol: typeof VOICE_PROTOCOL;
  /** wss://…/v1/connect — append ?ticket=… */
  url: string;
  ticket: string;
  connectBy: string;
  expiresAt: string;
  limits: { maxUtteranceMs: number; maxSpokenChars: number; sessionMaxMs: number };
  preferences: { speakReplies: boolean; speechLanguage: VoiceSpeechLanguage; voice: VoiceSpeaker; language: string };
}
