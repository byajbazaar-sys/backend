import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryHuidAndProductId1775200000000 implements MigrationInterface {
  name = 'AddInventoryHuidAndProductId1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "huid" varchar(50),
        ADD COLUMN IF NOT EXISTS "product_id" varchar(50)
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
        ADD COLUMN IF NOT EXISTS "product_id" varchar(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
        DROP COLUMN IF EXISTS "product_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        DROP COLUMN IF EXISTS "huid",
        DROP COLUMN IF EXISTS "product_id"
    `);
  }
}
