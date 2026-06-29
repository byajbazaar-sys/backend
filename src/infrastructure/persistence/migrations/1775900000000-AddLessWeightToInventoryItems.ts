import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLessWeightToInventoryItems1775900000000 implements MigrationInterface {
  name = 'AddLessWeightToInventoryItems1775900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "less_weight" numeric(10,3) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "less_weight" = ROUND(("gross_weight" - "net_weight")::numeric, 3)
      WHERE "gross_weight" > "net_weight"
        AND "less_weight" = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        DROP COLUMN IF EXISTS "less_weight"
    `);
  }
}
