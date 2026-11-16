import { MigrationInterface, QueryRunner } from 'typeorm';

/** Inventory items can be saved without a category. */
export class OptionalInventoryCategory1794300000000 implements MigrationInterface {
  name = 'OptionalInventoryCategory1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" ALTER COLUMN "category_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only reversible once every item has a category again.
    await queryRunner.query(`ALTER TABLE "inventory_items" ALTER COLUMN "category_id" SET NOT NULL`);
  }
}
