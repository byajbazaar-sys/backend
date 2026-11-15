import { MigrationInterface, QueryRunner } from 'typeorm';

/** Free-form size on inventory items (ring size, bangle size, chain length), shown on labels. */
export class AddInventoryItemSize1793900000000 implements MigrationInterface {
  name = 'AddInventoryItemSize1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "size" varchar(30)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "size"`);
  }
}
