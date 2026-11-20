import { MigrationInterface, QueryRunner } from 'typeorm';

/** Voiceovers: text spoken in the voice of an uploaded sample (ChatterBox Multilingual on a Kaggle GPU). */
export class CreateMarketingVoiceovers1700000000011 implements MigrationInterface {
  name = 'CreateMarketingVoiceovers1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_voiceovers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "text" text NOT NULL,
        "language" varchar(8) NOT NULL,
        "settings" jsonb NOT NULL,
        "sample_key" varchar(500) NOT NULL,
        "audio_key" varchar(500),
        "status" varchar(20) NOT NULL,
        "error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_voiceovers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketing_voiceovers_user" ON "marketing_voiceovers" ("user_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_voiceovers"`);
  }
}
