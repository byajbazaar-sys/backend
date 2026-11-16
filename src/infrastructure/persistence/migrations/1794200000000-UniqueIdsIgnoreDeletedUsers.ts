import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deleting an account is a soft delete, so the row (and its Google ID / verified mobile) stays.
 * Signing up again with the same Google account or mobile then hit the unique constraint
 * ("duplicate key value violates unique constraint UQ_0bd5012aeb82628e07f6a1be53b").
 * Like email (UQ_users_email_active), these are now unique among active users only.
 */
export class UniqueIdsIgnoreDeletedUsers1794200000000 implements MigrationInterface {
  name = 'UniqueIdsIgnoreDeletedUsers1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_0bd5012aeb82628e07f6a1be53b"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_google_id"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_google_id_active" ON "users" ("google_id") WHERE "google_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_verified_phone"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_verified_phone" ON "users" ("phone_number") WHERE "is_phone_verified" = true AND "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_verified_phone"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_verified_phone" ON "users" ("phone_number") WHERE "is_phone_verified" = true`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_google_id_active"`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_0bd5012aeb82628e07f6a1be53b" UNIQUE ("google_id")`);
  }
}
