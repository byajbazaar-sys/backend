import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreNoAdsWelcomeTrial1780330000000 implements MigrationInterface {
  name = 'RestoreNoAdsWelcomeTrial1780330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users"
       SET "trial_ends_at" = "created_at" + INTERVAL '7 days'
       WHERE "trial_ends_at" IS NULL
         AND "user_type" != 'admin'
         AND "created_at" + INTERVAL '7 days' > NOW()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "trial_ends_at" = NULL WHERE "trial_ends_at" IS NOT NULL`);
  }
}
