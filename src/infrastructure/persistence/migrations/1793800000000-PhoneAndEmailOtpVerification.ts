import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email and mobile are verified with one-time codes (email via Resend, SMS via StartMessaging).
 * - Adds mobile verification columns. Existing users stay unverified and can verify from Account.
 * - A verified mobile number belongs to one account only (partial unique index: unverified
 *   duplicates in old data don't block the migration).
 * - Drops the old email-link token columns; codes are never stored.
 */
export class PhoneAndEmailOtpVerification1793800000000 implements MigrationInterface {
  name = 'PhoneAndEmailOtpVerification1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_phone_verified" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verification_required" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_verified_phone" ON "users" ("phone_number") WHERE "is_phone_verified" = true`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verification_token"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verification_expires"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_token" varchar(255)`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_expires" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_verified_phone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_verification_required"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_verified_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_phone_verified"`);
  }
}
