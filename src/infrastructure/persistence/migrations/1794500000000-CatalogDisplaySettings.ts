import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per-shop catalog settings: which item details are public, and a WhatsApp number for enquiries. */
export class CatalogDisplaySettings1794500000000 implements MigrationInterface {
  name = 'CatalogDisplaySettings1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "catalog_display" jsonb`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "catalog_whatsapp_number" varchar(20)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "catalog_whatsapp_number"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "catalog_display"`);
  }
}
