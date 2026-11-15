import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The app moves from "ads unless you subscribe" to "7-day trial, then a paid plan":
 * - Checkout plans become ₹499/month and ₹4,999/year (older plans are deactivated, not deleted,
 *   so existing subscriptions keep their history).
 * - Existing shops get at most 7 days from this release to choose a plan: a longer trial is cut to
 *   7 days, and shops whose trial already ended get 7 days instead of being locked out at once.
 *
 * provider_plan_id only needs to be unique: checkout creates/looks up the Razorpay plan by amount.
 */
export class PaidPlansWithTrial1793700000000 implements MigrationInterface {
  name = 'PaidPlansWithTrial1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plans" SET "active" = false
      WHERE "active" = true
        AND NOT (
          ("interval" = 'monthly' AND "interval_count" = 1 AND "price" = 499)
          OR ("interval" = 'yearly' AND "interval_count" = 1 AND "price" = 4999)
        )
    `);

    await queryRunner.query(`
      INSERT INTO "plans" ("name", "price", "currency", "interval", "interval_count", "provider_plan_id", "active")
      SELECT 'Monthly', 499, 'INR', 'monthly', 1, 'plan_byajbazaar_monthly_499', true
      WHERE NOT EXISTS (
        SELECT 1 FROM "plans"
        WHERE "active" = true AND "interval" = 'monthly' AND "interval_count" = 1 AND "price" = 499
      )
    `);

    await queryRunner.query(`
      INSERT INTO "plans" ("name", "price", "currency", "interval", "interval_count", "provider_plan_id", "active")
      SELECT 'Yearly', 4999, 'INR', 'yearly', 1, 'plan_byajbazaar_yearly_4999', true
      WHERE NOT EXISTS (
        SELECT 1 FROM "plans"
        WHERE "active" = true AND "interval" = 'yearly' AND "interval_count" = 1 AND "price" = 4999
      )
    `);

    // Old names said "Ad-free"; the plans now unlock the app.
    await queryRunner.query(`UPDATE "plans" SET "name" = 'Monthly' WHERE "name" = 'Ad-free'`);
    await queryRunner.query(`UPDATE "plans" SET "name" = 'Yearly' WHERE "name" = 'Ad-free Yearly'`);

    await queryRunner.query(`
      UPDATE "users"
      SET "trial_ends_at" = NOW() + INTERVAL '7 days'
      WHERE "user_type" != 'admin'
        AND (
          "trial_ends_at" IS NULL
          OR "trial_ends_at" <= NOW()
          OR "trial_ends_at" > NOW() + INTERVAL '7 days'
        )
    `);

    // Coupons sized for the ₹48 plan: let them apply to the new prices again.
    await queryRunner.query(`UPDATE "coupons" SET "minimum_amount" = 499 WHERE "minimum_amount" = 48`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "plans"
      WHERE "provider_plan_id" IN ('plan_byajbazaar_monthly_499', 'plan_byajbazaar_yearly_4999')
    `);
    await queryRunner.query(`
      UPDATE "plans" SET "active" = true
      WHERE "provider_plan_id" IN ('plan_byajbazaar_monthly_48', 'plan_byajbazaar_yearly_399')
    `);
    await queryRunner.query(`UPDATE "coupons" SET "minimum_amount" = 48 WHERE "minimum_amount" = 499`);
  }
}
