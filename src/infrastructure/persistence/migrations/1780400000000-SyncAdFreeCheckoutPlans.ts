import { MigrationInterface, QueryRunner } from 'typeorm';

/** Align checkout plans with SUBSCRIPTION_PLAN_AMOUNT_INR (48) / YEARLY (399). */
export class SyncAdFreeCheckoutPlans1780400000000 implements MigrationInterface {
  name = 'SyncAdFreeCheckoutPlans1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plans"
      SET "active" = false
      WHERE "active" = true
        AND "interval" = 'monthly'
        AND "interval_count" = 1
        AND "price" > 48
    `);

    await queryRunner.query(`
      INSERT INTO "plans" ("name", "price", "currency", "interval", "interval_count", "provider_plan_id", "active")
      SELECT 'Ad-free', 48, 'INR', 'monthly', 1, 'plan_byajbazaar_monthly_48', true
      WHERE NOT EXISTS (
        SELECT 1 FROM "plans"
        WHERE "active" = true AND "interval" = 'monthly' AND "interval_count" = 1 AND "price" = 48
      )
    `);

    await queryRunner.query(`
      UPDATE "plans"
      SET "active" = false
      WHERE "active" = true
        AND "interval" = 'yearly'
        AND "interval_count" = 1
        AND "price" <> 399
    `);

    await queryRunner.query(`
      INSERT INTO "plans" ("name", "price", "currency", "interval", "interval_count", "provider_plan_id", "active")
      SELECT 'Ad-free Yearly', 399, 'INR', 'yearly', 1, 'plan_byajbazaar_yearly_399', true
      WHERE NOT EXISTS (
        SELECT 1 FROM "plans"
        WHERE "active" = true AND "interval" = 'yearly' AND "interval_count" = 1 AND "price" = 399
      )
    `);

    // Flat ₹100 off only made sense on legacy ₹599 pricing — cap for ₹48/month checkout.
    await queryRunner.query(`
      UPDATE "coupons"
      SET "value" = 20, "maximum_discount" = 20
      WHERE "code" = 'WELCOME100' AND "type" = 'flat'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "plans"
      WHERE "provider_plan_id" IN ('plan_byajbazaar_monthly_48', 'plan_byajbazaar_yearly_399')
    `);
  }
}
