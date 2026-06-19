import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseRateAndProfitTracking1775800000000 implements MigrationInterface {
  name = 'AddPurchaseRateAndProfitTracking1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD COLUMN IF NOT EXISTS "purchase_rate_per_gram" numeric(12,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
      ADD COLUMN IF NOT EXISTS "purchase_rate_per_gram" numeric(12,2),
      ADD COLUMN IF NOT EXISTS "purchase_cost" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "profit_amount" numeric(14,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_bills"
      ADD COLUMN IF NOT EXISTS "total_purchase_cost" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "total_profit" numeric(14,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bills"
      DROP COLUMN IF EXISTS "total_profit",
      DROP COLUMN IF EXISTS "total_purchase_cost"
    `);
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
      DROP COLUMN IF EXISTS "profit_amount",
      DROP COLUMN IF EXISTS "purchase_cost",
      DROP COLUMN IF EXISTS "purchase_rate_per_gram"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      DROP COLUMN IF EXISTS "purchase_rate_per_gram"
    `);
  }
}
