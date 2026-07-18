import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeInventorySkuBarcodePerUser1778400000000 implements MigrationInterface {
  name = 'ScopeInventorySkuBarcodePerUser1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "UQ_inventory_items_sku"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "UQ_inventory_items_barcode"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_items_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_items_barcode"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_inventory_items_created_by_sku"
        ON "inventory_items" ("created_by", "sku")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_inventory_items_created_by_barcode"
        ON "inventory_items" ("created_by", "barcode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_inventory_items_created_by_barcode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_inventory_items_created_by_sku"`);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD CONSTRAINT "UQ_inventory_items_sku" UNIQUE ("sku")
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD CONSTRAINT "UQ_inventory_items_barcode" UNIQUE ("barcode")
    `);
  }
}
