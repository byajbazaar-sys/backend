import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuantityPricingModeToSalesBillItems1780300000000 implements MigrationInterface {
  name = 'AddQuantityPricingModeToSalesBillItems1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
      ADD COLUMN IF NOT EXISTS "quantity_pricing_mode" varchar(16) NOT NULL DEFAULT 'MULTIPLY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items" DROP COLUMN IF EXISTS "quantity_pricing_mode"
    `);
  }
}
