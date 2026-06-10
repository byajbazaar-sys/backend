import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryStockAndSupplier1774900000000 implements MigrationInterface {
  name = 'AddInventoryStockAndSupplier1774900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD COLUMN IF NOT EXISTS "stock_quantity" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD COLUMN IF NOT EXISTS "supplier_name" character varying(255)
    `);
    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "stock_quantity" = 0
      WHERE "status" = 'SOLD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "supplier_name"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "stock_quantity"`);
  }
}
