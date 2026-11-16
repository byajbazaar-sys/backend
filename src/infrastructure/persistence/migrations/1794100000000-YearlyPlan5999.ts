import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Yearly plan moves from ₹4,999 to ₹5,999 (shown against a ₹15,999 list price).
 * The ₹4,999 plan is deactivated, not deleted, so current yearly subscriptions keep renewing on it.
 * Checkout creates/looks up the Razorpay plan by amount, so no manual Razorpay step is needed.
 */
export class YearlyPlan59991794100000000 implements MigrationInterface {
  name = 'YearlyPlan59991794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plans" SET "active" = false
      WHERE "active" = true AND "interval" = 'yearly' AND "interval_count" = 1 AND "price" != 5999
    `);
    await queryRunner.query(`
      INSERT INTO "plans" ("name", "price", "currency", "interval", "interval_count", "provider_plan_id", "active")
      SELECT 'Yearly', 5999, 'INR', 'yearly', 1, 'plan_byajbazaar_yearly_5999', true
      WHERE NOT EXISTS (
        SELECT 1 FROM "plans"
        WHERE "active" = true AND "interval" = 'yearly' AND "interval_count" = 1 AND "price" = 5999
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "plans" WHERE "provider_plan_id" = 'plan_byajbazaar_yearly_5999'`);
    await queryRunner.query(`
      UPDATE "plans" SET "active" = true WHERE "provider_plan_id" = 'plan_byajbazaar_yearly_4999'
    `);
  }
}
