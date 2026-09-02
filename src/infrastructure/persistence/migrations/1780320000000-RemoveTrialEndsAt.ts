import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTrialEndsAt1780320000000 implements MigrationInterface {
  name = 'RemoveTrialEndsAt1780320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "trial_ends_at" = NULL WHERE "trial_ends_at" IS NOT NULL`);

    // Coupons were seeded with ₹599 minimum — align with the new ₹48/month ad-free plan.
    await queryRunner.query(
      `UPDATE "coupons" SET "minimum_amount" = 48 WHERE "minimum_amount" >= 599`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users" SET "trial_ends_at" = "created_at" + INTERVAL '7 days' WHERE "trial_ends_at" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "coupons" SET "minimum_amount" = 599 WHERE "minimum_amount" = 48`,
    );
  }
}
