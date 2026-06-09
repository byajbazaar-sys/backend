import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryQrFields1774600000000 implements MigrationInterface {
  name = 'AddInventoryQrFields1774600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD COLUMN IF NOT EXISTS "qr_value" text NULL,
      ADD COLUMN IF NOT EXISTS "barcode_image_url" varchar(500) NULL,
      ADD COLUMN IF NOT EXISTS "qr_image_url" varchar(500) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      DROP COLUMN IF EXISTS "qr_image_url",
      DROP COLUMN IF EXISTS "barcode_image_url",
      DROP COLUMN IF EXISTS "qr_value"
    `);
  }
}
