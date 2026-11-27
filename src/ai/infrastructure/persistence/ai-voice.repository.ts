import { Injectable } from '@nestjs/common';

import { AiDatabase } from './ai-database';
import { AiVoiceSessionEntity } from './entities/ai.entities';
import type { AiVoiceSession, AiVoiceUsageDelta } from '../../voice/domain/voice.types';
import type { AiVoiceTotals, IAiVoiceSessionsRepository } from '../../voice/ports/voice.ports';

/** Usage counters and their columns (fixed list: column names are never built from input). */
const USAGE_COLUMNS: [keyof AiVoiceUsageDelta, string][] = [
  ['audioMs', 'audio_ms'],
  ['partialAudioMs', 'partial_audio_ms'],
  ['sttRequests', 'stt_requests'],
  ['sttLatencyMs', 'stt_latency_ms'],
  ['sttErrors', 'stt_errors'],
  ['ttsChars', 'tts_chars'],
  ['ttsRequests', 'tts_requests'],
  ['ttsLatencyMs', 'tts_latency_ms'],
  ['ttsErrors', 'tts_errors'],
  ['turns', 'turns'],
];

const toSession = (e: AiVoiceSessionEntity): AiVoiceSession => ({
  id: e.id,
  shopId: e.shopId,
  actorUserId: e.actorUserId,
  conversationId: e.conversationId,
  status: e.status === 'open' ? 'open' : 'ended',
  endReason: e.endReason,
  createdAt: e.createdAt,
  expiresAt: e.expiresAt,
  endedAt: e.endedAt,
  lastActivityAt: e.lastActivityAt,
  audioMs: e.audioMs,
  partialAudioMs: e.partialAudioMs,
  sttRequests: e.sttRequests,
  sttLatencyMs: e.sttLatencyMs,
  sttErrors: e.sttErrors,
  ttsChars: e.ttsChars,
  ttsRequests: e.ttsRequests,
  ttsLatencyMs: e.ttsLatencyMs,
  ttsErrors: e.ttsErrors,
  turns: e.turns,
});

/** Voice sessions (AI database): who may talk, until when, and what it used. No audio and no transcript text. */
@Injectable()
export class AiVoiceSessionsRepository implements IAiVoiceSessionsRepository {
  constructor(private readonly db: AiDatabase) {}

  async create(input: {
    shopId: string;
    actorUserId: string;
    conversationId: string | null;
    expiresAt: Date;
  }): Promise<AiVoiceSession> {
    const repo = await this.db.repository(AiVoiceSessionEntity);
    return toSession(await repo.save(repo.create({ ...input, status: 'open' })));
  }

  async findById(id: string): Promise<AiVoiceSession | null> {
    const row = await (await this.db.repository(AiVoiceSessionEntity)).findOne({ where: { id } });
    return row ? toSession(row) : null;
  }

  async listOpen(filter: { actorUserId?: string; shopId?: string }, now: Date): Promise<AiVoiceSession[]> {
    const qb = (await this.db.repository(AiVoiceSessionEntity))
      .createQueryBuilder('v')
      .where(`v.status = 'open'`)
      .andWhere('v.expires_at > :now', { now });
    if (filter.actorUserId) qb.andWhere('v.actor_user_id = :actor', { actor: filter.actorUserId });
    if (filter.shopId) qb.andWhere('v.shop_id = :shop', { shop: filter.shopId });
    return (await qb.orderBy('v.created_at', 'ASC').getMany()).map(toSession);
  }

  async totals(filter: { actorUserId?: string; shopId?: string }, since: Date): Promise<AiVoiceTotals> {
    const qb = (await this.db.repository(AiVoiceSessionEntity))
      .createQueryBuilder('v')
      .select('COUNT(*)', 'sessions')
      .addSelect('COALESCE(SUM(v.audio_ms), 0)', 'audio_ms')
      .addSelect('COALESCE(SUM(v.partial_audio_ms), 0)', 'partial_audio_ms')
      .addSelect('COALESCE(SUM(v.tts_chars), 0)', 'tts_chars')
      .addSelect('COALESCE(SUM(v.turns), 0)', 'turns')
      .where('v.created_at >= :since', { since });
    if (filter.actorUserId) qb.andWhere('v.actor_user_id = :actor', { actor: filter.actorUserId });
    if (filter.shopId) qb.andWhere('v.shop_id = :shop', { shop: filter.shopId });
    const row = (await qb.getRawOne<Record<string, string>>()) ?? {};
    return {
      sessions: Number(row.sessions ?? 0),
      audioMs: Number(row.audio_ms ?? 0),
      partialAudioMs: Number(row.partial_audio_ms ?? 0),
      ttsChars: Number(row.tts_chars ?? 0),
      turns: Number(row.turns ?? 0),
    };
  }

  async addUsage(id: string, delta: AiVoiceUsageDelta, at: Date): Promise<void> {
    const values: unknown[] = [id, at];
    const sets = ['last_activity_at = $2'];
    for (const [key, column] of USAGE_COLUMNS) {
      const value = Math.max(0, Math.round(Number(delta[key] ?? 0)));
      if (!value) continue;
      values.push(value);
      sets.push(`${column} = ${column} + $${values.length}`);
    }
    await (await this.db.connection()).query(`UPDATE ai_voice_sessions SET ${sets.join(', ')} WHERE id = $1`, values);
  }

  async setConversation(id: string, conversationId: string): Promise<void> {
    await (await this.db.repository(AiVoiceSessionEntity)).update({ id }, { conversationId });
  }

  async end(id: string, reason: string, at: Date): Promise<boolean> {
    const result = await (
      await this.db.repository(AiVoiceSessionEntity)
    )
      .createQueryBuilder()
      .update(AiVoiceSessionEntity)
      .set({ status: 'ended', endReason: reason.slice(0, 40), endedAt: at })
      .where('id = :id', { id })
      .andWhere(`status = 'open'`)
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async expireStale(now: Date): Promise<number> {
    const result = await (await this.db.repository(AiVoiceSessionEntity))
      .createQueryBuilder()
      .update(AiVoiceSessionEntity)
      .set({ status: 'ended', endReason: 'expired', endedAt: now })
      .where(`status = 'open'`)
      .andWhere('expires_at <= :now', { now })
      .execute();
    return result.affected ?? 0;
  }
}
