import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTryOnBackgroundColorToInventoryItems1778800000000 implements MigrationInterface {
  name = 'AddTryOnBackgroundColorToInventoryItems1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "try_on_background_color" varchar(7)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        DROP COLUMN IF EXISTS "try_on_background_color"
    `);
  }
}
