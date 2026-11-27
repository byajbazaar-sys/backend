import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ByajBazaar AI voice: sessions (who may talk until when, and the speech / voice usage of each) and the voice
 * preferences (speak replies, speech language, voice). No audio and no transcript text is stored here.
 */
export class CreateAiVoiceSessions1801000000003 implements MigrationInterface {
  name = 'CreateAiVoiceSessions1801000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_voice_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "actor_user_id" uuid NOT NULL,
        "conversation_id" uuid,
        "status" varchar(12) NOT NULL DEFAULT 'open',
        "end_reason" varchar(40),
        "expires_at" timestamptz NOT NULL,
        "ended_at" timestamptz,
        "last_activity_at" timestamptz,
        "audio_ms" integer NOT NULL DEFAULT 0,
        "partial_audio_ms" integer NOT NULL DEFAULT 0,
        "stt_requests" integer NOT NULL DEFAULT 0,
        "stt_latency_ms" integer NOT NULL DEFAULT 0,
        "stt_errors" integer NOT NULL DEFAULT 0,
        "tts_chars" integer NOT NULL DEFAULT 0,
        "tts_requests" integer NOT NULL DEFAULT 0,
        "tts_latency_ms" integer NOT NULL DEFAULT 0,
        "tts_errors" integer NOT NULL DEFAULT 0,
        "turns" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_voice_sessions" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_voice_sessions_actor" ON "ai_voice_sessions" ("actor_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_voice_sessions_shop" ON "ai_voice_sessions" ("shop_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_voice_sessions_open" ON "ai_voice_sessions" ("expires_at") WHERE "status" = 'open'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_user_preferences" ADD COLUMN IF NOT EXISTS "speak_replies" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_user_preferences" ADD COLUMN IF NOT EXISTS "speech_language" varchar(8) NOT NULL DEFAULT 'auto'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_user_preferences" ADD COLUMN IF NOT EXISTS "voice" varchar(24) NOT NULL DEFAULT 'asteria'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_user_preferences" DROP COLUMN IF EXISTS "voice"`);
    await queryRunner.query(`ALTER TABLE "ai_user_preferences" DROP COLUMN IF EXISTS "speech_language"`);
    await queryRunner.query(`ALTER TABLE "ai_user_preferences" DROP COLUMN IF EXISTS "speak_replies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_voice_sessions"`);
  }
}
