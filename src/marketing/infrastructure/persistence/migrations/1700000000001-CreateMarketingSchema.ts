import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketing database schema: campaigns (one input → 5 scenes → merged film), scenes, per-business brand kit
 * (logo + logo video), Kaggle accounts and render jobs (the unit of work for one Kaggle notebook session).
 * user_id refers to ByajBazaar users in the main database; there are no cross-database foreign keys.
 */
export class CreateMarketingSchema1700000000001 implements MigrationInterface {
  name = 'CreateMarketingSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "source_type" varchar(20) NOT NULL,
        "inventory_item_id" uuid,
        "source_image_key" varchar(500) NOT NULL,
        "style" varchar(30) NOT NULL,
        "quality" varchar(10) NOT NULL,
        "status" varchar(20) NOT NULL,
        "progress" smallint NOT NULL DEFAULT 0,
        "stage_message" varchar(255),
        "merged_video_key" varchar(500),
        "error" text,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_campaigns" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketing_campaigns_user_created" ON "marketing_campaigns" ("user_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_scenes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "campaign_id" uuid NOT NULL,
        "index" smallint NOT NULL,
        "image_prompt" text NOT NULL,
        "motion_prompt" text NOT NULL,
        "image_key" varchar(500),
        "image_status" varchar(20) NOT NULL,
        "video_key" varchar(500),
        "video_status" varchar(20) NOT NULL,
        "error" text,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_scenes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_marketing_scenes_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_marketing_scenes_campaign_index" ON "marketing_scenes" ("campaign_id", "index")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_brands" (
        "user_id" uuid NOT NULL,
        "business_name" varchar(255) NOT NULL,
        "logo_image_key" varchar(500),
        "logo_image_status" varchar(20) NOT NULL,
        "logo_video_key" varchar(500),
        "logo_video_status" varchar(20) NOT NULL,
        "error" text,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_brands" PRIMARY KEY ("user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kaggle_accounts" (
        "username" varchar(100) NOT NULL,
        "status" varchar(20) NOT NULL,
        "concurrency" smallint NOT NULL DEFAULT 1,
        "last_error" text,
        "gpu_info" varchar(255),
        "setup_attempt_at" TIMESTAMP WITH TIME ZONE,
        "ready_at" TIMESTAMP WITH TIME ZONE,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kaggle_accounts" PRIMARY KEY ("username")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_render_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "kind" varchar(20) NOT NULL,
        "user_id" uuid,
        "campaign_id" uuid,
        "worker_id" varchar(100),
        "slot" smallint,
        "status" varchar(20) NOT NULL,
        "payload" jsonb NOT NULL,
        "progress" smallint NOT NULL DEFAULT 0,
        "stage_message" varchar(255),
        "kernel_ref" varchar(255),
        "attempts" smallint NOT NULL DEFAULT 0,
        "error" text,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_render_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_marketing_render_jobs_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketing_render_jobs_status_created" ON "marketing_render_jobs" ("status", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_render_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kaggle_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_brands"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_scenes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_campaigns"`);
  }
}
