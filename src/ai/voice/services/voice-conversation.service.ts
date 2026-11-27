import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AiVoiceSessionsService } from './voice-sessions.service';
import { AiConfig } from '../../ai.config';
import {
  AiActionView,
  AiActor,
  AiChatResponse,
  AiPendingAction,
  AiPreferences,
  DEFAULT_AI_PREFERENCES,
  EAiAuditEvent,
  EAiIntent,
} from '../../application/domain';
import {
  AI_ACTIONS_REPOSITORY,
  AI_AUDIT_LOG,
  AI_PREFERENCES_REPOSITORY,
  IAiActionsRepository,
  IAiAuditLog,
  IAiPreferencesRepository,
} from '../../application/ports';
import { toActionView } from '../../application/services/ai-action-view';
import { AiActionsService } from '../../application/services/ai-actions.service';
import { AiOrchestratorService } from '../../application/services/ai-orchestrator.service';
import { voiceIntentOf } from '../domain/voice-intents';
import { normalizeTranscript } from '../domain/voice-normalizer';
import { SpeechPlan, speechFor } from '../domain/voice-speech';
import { VOICE_CONFIRMABLE_ACTIONS, VoiceTicketClaims } from '../domain/voice.types';
import { AI_VOICE_ACCESS, IAiVoiceAccess } from '../ports/voice.ports';

export interface VoiceTurnInput {
  /** The app's id for this utterance / typed message: a retry returns the first answer (nothing runs twice). */
  utteranceId: string;
  kind: 'speech' | 'text';
  /** What the recogniser heard (speech) or what was typed (text). */
  text: string;
  /** Whisper's language for the utterance (hi, en, gu, mr …). */
  language?: string | null;
  /** 0–1, from the recogniser. */
  confidence?: number | null;
  conversationId?: string | null;
  page?: string;
  audioMs?: number;
  partialAudioMs?: number;
  sttRequests?: number;
  sttLatencyMs?: number;
  sttErrors?: number;
}

export interface VoiceTurnResult {
  conversationId: string;
  /** assistant: the normal assistant turn; voice_confirm / voice_cancel: a spoken decision on an open preview. */
  handledBy: 'assistant' | 'voice_confirm' | 'voice_cancel' | 'voice_needs_tap';
  transcript: { original: string; text: string; language: string | null; flags: string[] } | null;
  response: AiChatResponse;
  speak: SpeechPlan & { voice: string };
}

type Phrase = 'tap' | 'several' | 'cancelled' | 'saved' | 'failed';
const PHRASES: Record<'en' | 'hi' | 'hinglish', Record<Phrase, string>> = {
  en: {
    tap: 'Loans, payments and deposits need a tap: please tap Confirm on the card.',
    several: 'There are a few previews open. Please tap Confirm on the one you want.',
    cancelled: 'Cancelled. Nothing was saved.',
    saved: 'Saved.',
    failed: 'That could not be saved.',
  },
  hinglish: {
    tap: 'Loan, payment aur deposit ke liye card par Confirm dabaiye.',
    several: 'Kuch previews khule hain. Jo chahiye uske card par Confirm dabaiye.',
    cancelled: 'Cancel ho gaya. Kuch save nahi hua.',
    saved: 'Save ho gaya.',
    failed: 'Save nahi ho paya.',
  },
  hi: {
    tap: 'लोन, पेमेंट और डिपॉज़िट के लिए कार्ड पर Confirm दबाइए।',
    several: 'कुछ प्रीव्यू खुले हैं। जो चाहिए उसके कार्ड पर Confirm दबाइए।',
    cancelled: 'रद्द कर दिया। कुछ सेव नहीं हुआ।',
    saved: 'सेव हो गया।',
    failed: 'सेव नहीं हो पाया।',
  },
};

/**
 * VoiceConversationService: one transcribed turn from the voice gateway, run through the SAME orchestrator,
 * tools, previews and conversation as typed messages. It adds only what is voice-specific: the person's access is
 * read afresh, the transcript is cleaned up (original kept), and a spoken "confirm" / "cancel" decides the single
 * open preview — stock and customers only; loans, payments and deposits always need a tap.
 */
@Injectable()
export class AiVoiceConversationService {
  constructor(
    private readonly config: AiConfig,
    private readonly sessions: AiVoiceSessionsService,
    private readonly orchestrator: AiOrchestratorService,
    private readonly actionsService: AiActionsService,
    @Inject(AI_ACTIONS_REPOSITORY) private readonly actions: IAiActionsRepository,
    @Inject(AI_PREFERENCES_REPOSITORY) private readonly preferences: IAiPreferencesRepository,
    @Inject(AI_VOICE_ACCESS) private readonly access: IAiVoiceAccess,
    @Inject(AI_AUDIT_LOG) private readonly audit: IAiAuditLog,
    @InjectPinoLogger(AiVoiceConversationService.name) private readonly logger: PinoLogger,
  ) {}

  async turn(claims: VoiceTicketClaims, input: VoiceTurnInput): Promise<VoiceTurnResult> {
    const session = await this.sessions.requireOpen(claims);
    const now = new Date();
    const raw = (input.text ?? '').trim();
    if (!raw) throw new BadRequestException('Empty message.');

    // Access is read for every turn: a member removed or demoted mid-session gets the new rights at once.
    const access = await this.access.accessFor(session.actorUserId, session.shopId);
    if (!access) {
      await this.sessions.close(session, 'access_removed');
      throw new ForbiddenException({
        code: 'AI_VOICE_ACCESS_REMOVED',
        message: 'You no longer have access to this shop.',
      });
    }
    const actor: AiActor = {
      shopId: session.shopId,
      actorUserId: session.actorUserId,
      shopRole: access.role,
      permissions: access.isOwner ? null : access.permissions,
      channel: 'voice',
    };

    if (input.kind === 'speech') {
      try {
        await this.sessions.assertDailyMinutes(actor.shopId, actor.actorUserId, now, input.audioMs ?? 0);
      } catch (err) {
        await this.audit.record({
          event: EAiAuditEvent.VoiceTurnRefused,
          shopId: actor.shopId,
          actorUserId: actor.actorUserId,
          data: { sessionId: session.id, reason: 'daily_limit' },
        });
        throw err;
      }
    }
    await this.sessions.addUsage(session.id, {
      audioMs: input.audioMs,
      partialAudioMs: input.partialAudioMs,
      sttRequests: input.sttRequests,
      sttLatencyMs: input.sttLatencyMs,
      sttErrors: input.sttErrors,
      turns: 1,
    });

    const prefs = await this.preferences.get(actor.actorUserId).catch(() => DEFAULT_AI_PREFERENCES);
    const conversationId = input.conversationId ?? session.conversationId ?? undefined;
    const normalized = input.kind === 'speech' ? normalizeTranscript(raw) : null;
    const message = normalized ? normalized.text : raw;
    const transcript = normalized
      ? {
          original: normalized.original,
          text: normalized.text,
          language: input.language ?? null,
          flags: normalized.flags,
        }
      : null;

    if (normalized && conversationId) {
      const decided = await this.spokenDecision(actor, conversationId, message, prefs, now);
      if (decided) {
        return {
          conversationId,
          handledBy: decided.handledBy,
          transcript,
          response: {
            conversationId,
            // Not a model turn: the decision is recorded as an event in the conversation by the actions service.
            turnIndex: -1,
            intent: decided.action?.intent ?? EAiIntent.Unknown,
            message: { text: decided.text },
            cards: [],
            actions: decided.action ? [decided.action] : [],
            replayed: false,
          },
          speak: { ...this.speech(decided.text, prefs), voice: prefs.voice },
        };
      }
    }

    const response = await this.orchestrator.chat(actor, {
      message,
      conversationId,
      clientMessageId: input.utteranceId,
      page: input.page,
      voice: normalized
        ? {
            original: normalized.original,
            language: input.language ?? null,
            confidence: input.confidence ?? null,
            flags: normalized.flags,
            confirmableByVoice: this.config.voice.spokenConfirm ? [...VOICE_CONFIRMABLE_ACTIONS] : [],
          }
        : undefined,
    });
    await this.sessions.setConversation(session, response.conversationId).catch(() => undefined);
    return {
      conversationId: response.conversationId,
      handledBy: 'assistant',
      transcript,
      response,
      speak: { ...this.speech(response.message.text, prefs), voice: prefs.voice },
    };
  }

  /** "confirm" / "cancel" said while exactly one preview of this person is open in the conversation. */
  private async spokenDecision(
    actor: AiActor,
    conversationId: string,
    message: string,
    prefs: AiPreferences,
    now: Date,
  ): Promise<{ handledBy: VoiceTurnResult['handledBy']; text: string; action: AiActionView | null } | null> {
    const intent = voiceIntentOf(message);
    if (!intent) return null;
    const open = (await this.actions.listOpenForConversation(conversationId, now)).filter(
      (a: AiPendingAction) => a.shopId === actor.shopId && a.actorUserId === actor.actorUserId,
    );
    if (!open.length) return null; // Nothing to decide: the assistant answers as usual.
    const say = (phrase: Phrase) =>
      PHRASES[prefs.language === 'hi' ? 'hi' : prefs.language === 'hinglish' ? 'hinglish' : 'en'][phrase];
    if (open.length > 1) return { handledBy: 'voice_needs_tap', text: say('several'), action: null };
    const [action] = open;

    if (intent === 'cancel') {
      const view = await this.actionsService.cancel(actor, action.id);
      return { handledBy: 'voice_cancel', text: say('cancelled'), action: view };
    }
    if (!this.config.voice.spokenConfirm || !VOICE_CONFIRMABLE_ACTIONS.has(action.action)) {
      return { handledBy: 'voice_needs_tap', text: say('tap'), action: toActionView(action, now) };
    }
    try {
      const view = await this.actionsService.confirm(actor, action.id, action.payloadHash);
      return { handledBy: 'voice_confirm', text: view.result?.summary ?? say('saved'), action: view };
    } catch (err) {
      this.logger.warn({ actionId: action.id, err: (err as Error).message }, 'Spoken confirmation failed');
      const view = await this.actionsService.get(actor, action.id).catch(() => null);
      const message =
        err instanceof HttpException
          ? ((err.getResponse() as { message?: string }).message ?? say('failed'))
          : say('failed');
      return { handledBy: 'voice_confirm', text: message, action: view };
    }
  }

  private speech(text: string, prefs: AiPreferences): SpeechPlan {
    return speechFor(text, {
      speakReplies: prefs.speakReplies,
      maxChars: this.config.voice.maxSpokenChars,
      multilingual: this.config.voice.kaggleTts,
    });
  }
}
