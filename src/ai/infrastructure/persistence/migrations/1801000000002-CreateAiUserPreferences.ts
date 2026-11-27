import { MigrationInterface, QueryRunner } from 'typeorm';

/** ByajBazaar AI: how each person wants the assistant to answer (language, reply length). One row per person. */
export class CreateAiUserPreferences1801000000002 implements MigrationInterface {
  name = 'CreateAiUserPreferences1801000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_user_preferences" (
        "actor_user_id" uuid NOT NULL,
        "language" varchar(16) NOT NULL DEFAULT 'auto',
        "reply_style" varchar(16) NOT NULL DEFAULT 'short',
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_user_preferences" PRIMARY KEY ("actor_user_id")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_user_preferences"`);
  }
}
