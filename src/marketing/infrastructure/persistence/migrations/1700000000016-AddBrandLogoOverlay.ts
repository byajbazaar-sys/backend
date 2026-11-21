import { MigrationInterface, QueryRunner } from 'typeorm';

/** Shop logo on exported photos (Instagram, downloads): on unless the owner turns it off. */
export class AddBrandLogoOverlay1700000000016 implements MigrationInterface {
  name = 'AddBrandLogoOverlay1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "marketing_brands" ADD COLUMN IF NOT EXISTS "logo_overlay" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "marketing_brands" DROP COLUMN IF EXISTS "logo_overlay"`);
  }
}
