import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMakingChargeModeToInventoryItems1778300000000 implements MigrationInterface {
  name = 'AddMakingChargeModeToInventoryItems1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "e_making_charge_mode_enum" AS ENUM ('FIXED', 'PERCENT', 'PER_PC')
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "making_charge_mode" "e_making_charge_mode_enum" NOT NULL DEFAULT 'FIXED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        DROP COLUMN IF EXISTS "making_charge_mode"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "e_making_charge_mode_enum"
    `);
  }
}
