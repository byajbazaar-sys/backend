import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketingScheduledPosts1700000000007 implements MigrationInterface {
  name = 'CreateMarketingScheduledPosts1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_scheduled_posts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "media_type" varchar(10) NOT NULL,
        "source_type" varchar(20) NOT NULL,
        "source_id" uuid NOT NULL,
        "source_index" smallint,
        "source_title" varchar(255) NOT NULL,
        "asset_key" varchar(500) NOT NULL,
        "caption" text NOT NULL DEFAULT '',
        "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'SCHEDULED',
        "instagram_media_id" varchar(64),
        "error" text,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_scheduled_posts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketing_scheduled_posts_user_date" ON "marketing_scheduled_posts" ("user_id", "scheduled_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketing_scheduled_posts_due" ON "marketing_scheduled_posts" ("status", "scheduled_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_scheduled_posts"`);
  }
}
