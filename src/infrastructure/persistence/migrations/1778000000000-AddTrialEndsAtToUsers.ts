import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrialEndsAtToUsers1778000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "trial_ends_at" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `UPDATE "users"
       SET "trial_ends_at" = "created_at" + INTERVAL '7 days'
       WHERE "trial_ends_at" IS NULL
         AND "user_type" != 'admin'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "trial_ends_at"`);
  }
}
