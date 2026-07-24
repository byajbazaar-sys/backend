import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveTryOnBackgroundColorToUsers1778900000000 implements MigrationInterface {
  name = 'MoveTryOnBackgroundColorToUsers1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "try_on_background_color" varchar(7) DEFAULT '#1a1520'
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        DROP COLUMN IF EXISTS "try_on_background_color"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "try_on_background_color" varchar(7)
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "try_on_background_color"
    `);
  }
}
