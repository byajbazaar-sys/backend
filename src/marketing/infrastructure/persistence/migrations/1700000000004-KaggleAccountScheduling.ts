import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Load-balanced Kaggle dispatch: cached GPU quota (no Kaggle API call on every dispatch), a cool-down after an account
 * fails to start a notebook (its jobs go to other accounts meanwhile), when it was last given a job (round robin
 * among equally free accounts), and per-account job counts for the admin screen.
 */
export class KaggleAccountScheduling1700000000004 implements MigrationInterface {
  name = 'KaggleAccountScheduling1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kaggle_accounts"
        ADD COLUMN IF NOT EXISTS "gpu_hours_left" real,
        ADD COLUMN IF NOT EXISTS "quota_checked_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "cooldown_until" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "last_assigned_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "jobs_completed" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "jobs_failed" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kaggle_accounts"
        DROP COLUMN IF EXISTS "jobs_failed",
        DROP COLUMN IF EXISTS "jobs_completed",
        DROP COLUMN IF EXISTS "last_assigned_at",
        DROP COLUMN IF EXISTS "cooldown_until",
        DROP COLUMN IF EXISTS "quota_checked_at",
        DROP COLUMN IF EXISTS "gpu_hours_left"
    `);
  }
}
