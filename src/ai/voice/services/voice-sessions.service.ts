import {
  Optional,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { AiConfig } from '../../ai.config';
import { AiActor, AiPreferences, DEFAULT_AI_PREFERENCES, EAiAuditEvent } from '../../application/domain';
import {
  AI_AUDIT_LOG,
  AI_PREFERENCES_REPOSITORY,
  IAiAuditLog,
  IAiPreferencesRepository,
} from '../../application/ports';
import { AiJobsService } from '../../application/services/ai-jobs.service';
import { signVoiceTicket } from '../domain/voice-ticket';
import {
  AiVoiceSession,
  AiVoiceUsageDelta,
  VOICE_PROTOCOL,
  VoiceSessionGrant,
  VoiceTicketClaims,
} from '../domain/voice.types';
import { AI_VOICE_SESSIONS_REPOSITORY, IAiVoiceSessionsRepository } from '../ports/voice.ports';

const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * VoiceSessionService: who may talk to the assistant by voice, for how long, and how much. A session belongs to one
 * person in one shop (taken from the authenticated request); the app connects to the voice gateway with a ticket
 * that is valid for two minutes, and asks for a fresh one to reconnect.
 */
@Injectable()
export class AiVoiceSessionsService {
  constructor(
    private readonly config: AiConfig,
    @Inject(AI_VOICE_SESSIONS_REPOSITORY) private readonly sessions: IAiVoiceSessionsRepository,
    @Inject(AI_PREFERENCES_REPOSITORY) private readonly preferences: IAiPreferencesRepository,
    @Inject(AI_AUDIT_LOG) private readonly audit: IAiAuditLog,
    @Optional() private readonly jobs?: AiJobsService,
  ) {}

  get available(): boolean {
    return this.config.voiceEnabled;
  }

  async start(actor: AiActor, input: { conversationId?: string }): Promise<VoiceSessionGrant> {
    const voice = this.config.voice;
    if (!this.config.voiceEnabled) {
      throw new ServiceUnavailableException({ code: 'AI_VOICE_NOT_CONFIGURED', message: 'Voice is not set up yet.' });
    }
    const now = new Date();
    // Independent reads at once: starting voice is on the person's critical path ("Starting voice…").
    const [, mine, shopOpen, prefs] = await Promise.all([
      this.assertDailyMinutes(actor.shopId, actor.actorUserId, now),
      this.sessions.listOpen({ actorUserId: actor.actorUserId }, now),
      this.sessions.listOpen({ shopId: actor.shopId }, now),
      this.prefsOf(actor.actorUserId),
    ]);

    // A person on a new device (or after a crash) takes over: their oldest sessions end at the limit (and so do not
    // count against the shop's limit).
    const replaced = mine.slice(0, Math.max(0, mine.length - voice.maxConcurrentPerActor + 1));
    const replacedIds = new Set(replaced.map((s) => s.id));
    if (shopOpen.filter((s) => !replacedIds.has(s.id)).length >= voice.maxConcurrentPerShop) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_VOICE_BUSY',
          message: `${voice.maxConcurrentPerShop} people in this shop are already using voice. Try again in a few minutes.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Hindi replies are spoken on a warm Kaggle worker: ask for one now (existing account rules) if none is up —
    // queued while the session is created, not before it.
    const prewarm =
      voice.kaggleTts && this.jobs
        ? this.jobs
            .submit({ type: 'voice.prewarm' }, `ai-voice-prewarm-${Math.floor(now.getTime() / 60_000)}`)
            .catch(() => undefined)
        : undefined;
    await Promise.all(replaced.map((old) => this.sessions.end(old.id, 'replaced', now)));
    const session = await this.sessions.create({
      shopId: actor.shopId,
      actorUserId: actor.actorUserId,
      conversationId: input.conversationId ?? null,
      expiresAt: new Date(now.getTime() + voice.sessionMaxMs),
    });
    await Promise.all([
      this.audit.record({
        event: EAiAuditEvent.VoiceSessionStarted,
        shopId: actor.shopId,
        actorUserId: actor.actorUserId,
        conversationId: input.conversationId ?? null,
        data: { sessionId: session.id },
      }),
      prewarm,
    ]);
    return this.grant(session, prefs, now);
  }

  /** A fresh connect ticket for an open session (the app reconnecting). */
  async ticket(actor: AiActor, sessionId: string): Promise<VoiceSessionGrant> {
    const session = await this.owned(actor, sessionId);
    const now = new Date();
    this.assertOpen(session, now);
    return this.grant(session, await this.prefsOf(actor.actorUserId), now);
  }

  async end(actor: AiActor, sessionId: string): Promise<void> {
    const session = await this.owned(actor, sessionId);
    await this.close(session, 'ended');
  }

  /** The session behind a gateway call: genuine, open, and the same shop and person as the ticket. */
  async requireOpen(claims: VoiceTicketClaims): Promise<AiVoiceSession> {
    const session = await this.sessions.findById(claims.sid);
    if (!session || session.shopId !== claims.shop || session.actorUserId !== claims.act) {
      throw new UnauthorizedException({ code: 'AI_VOICE_SESSION_INVALID', message: 'Voice session not found.' });
    }
    this.assertOpen(session, new Date());
    return session;
  }

  async addUsage(sessionId: string, delta: AiVoiceUsageDelta): Promise<void> {
    await this.sessions.addUsage(sessionId, delta, new Date());
  }

  async setConversation(session: AiVoiceSession, conversationId: string): Promise<void> {
    if (session.conversationId !== conversationId) await this.sessions.setConversation(session.id, conversationId);
  }

  async close(session: AiVoiceSession, reason: string): Promise<void> {
    if (!(await this.sessions.end(session.id, reason, new Date()))) return;
    await this.audit.record({
      event: EAiAuditEvent.VoiceSessionEnded,
      shopId: session.shopId,
      actorUserId: session.actorUserId,
      conversationId: session.conversationId,
      data: { sessionId: session.id, reason: reason.slice(0, 40) },
    });
  }

  /** Throws 429 when the person or the shop has used today's minutes (with `extraMs` of new speech). */
  async assertDailyMinutes(shopId: string, actorUserId: string, now: Date, extraMs = 0): Promise<void> {
    const voice = this.config.voice;
    const since = startOfUtcDay(now);
    const [mine, shop] = await Promise.all([
      this.sessions.totals({ actorUserId }, since),
      this.sessions.totals({ shopId }, since),
    ]);
    const over =
      mine.audioMs + extraMs >= voice.dailyMinutesPerActor * 60_000
        ? `You have used today's ${voice.dailyMinutesPerActor} minutes of voice.`
        : shop.audioMs + extraMs >= voice.dailyMinutesPerShop * 60_000
          ? `This shop has used today's ${voice.dailyMinutesPerShop} minutes of voice.`
          : null;
    if (over) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_VOICE_DAILY_LIMIT',
          message: `${over} You can keep typing; voice is back after 5:30 AM (India time).`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async usage(actor: AiActor) {
    const voice = this.config.voice;
    const since = startOfUtcDay(new Date());
    const [mine, shop] = await Promise.all([
      this.sessions.totals({ actorUserId: actor.actorUserId }, since),
      this.sessions.totals({ shopId: actor.shopId }, since),
    ]);
    const minutes = (ms: number) => Math.round((ms / 60_000) * 10) / 10;
    return {
      available: this.config.voiceEnabled,
      today: { minutes: minutes(mine.audioMs), limitMinutes: voice.dailyMinutesPerActor, turns: mine.turns },
      shop:
        actor.shopRole === 'owner'
          ? {
              minutes: minutes(shop.audioMs),
              limitMinutes: voice.dailyMinutesPerShop,
              sessions: shop.sessions,
              spokenCharacters: shop.ttsChars,
              liveTranscriptMinutes: minutes(shop.partialAudioMs),
            }
          : null,
    };
  }

  private grant(session: AiVoiceSession, prefs: AiPreferences, now: Date): VoiceSessionGrant {
    const voice = this.config.voice;
    const cexp = Math.min(now.getTime() + voice.ticketTtlMs, session.expiresAt.getTime());
    const ticket = signVoiceTicket(
      {
        v: 1,
        sid: session.id,
        shop: session.shopId,
        act: session.actorUserId,
        cexp,
        sexp: session.expiresAt.getTime(),
      },
      voice.ticketSecret,
    );
    return {
      sessionId: session.id,
      protocol: VOICE_PROTOCOL,
      url: `${voice.gatewayUrl}/v1/connect`,
      ticket,
      connectBy: new Date(cexp).toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      limits: {
        maxUtteranceMs: voice.maxUtteranceMs,
        maxSpokenChars: voice.maxSpokenChars,
        sessionMaxMs: voice.sessionMaxMs,
      },
      preferences: {
        speakReplies: prefs.speakReplies,
        speechLanguage: prefs.speechLanguage,
        voice: prefs.voice,
        language: prefs.language,
      },
    };
  }

  private async owned(actor: AiActor, sessionId: string): Promise<AiVoiceSession> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.shopId !== actor.shopId || session.actorUserId !== actor.actorUserId) {
      throw new NotFoundException('Voice session not found');
    }
    return session;
  }

  private assertOpen(session: AiVoiceSession, now: Date): void {
    if (session.status !== 'open' || session.expiresAt.getTime() <= now.getTime()) {
      throw new GoneException({ code: 'AI_VOICE_SESSION_ENDED', message: 'This voice session has ended.' });
    }
  }

  private async prefsOf(actorUserId: string): Promise<AiPreferences> {
    return this.preferences.get(actorUserId).catch(() => DEFAULT_AI_PREFERENCES);
  }
}
