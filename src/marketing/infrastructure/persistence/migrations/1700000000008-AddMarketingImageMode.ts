import { MigrationInterface, QueryRunner } from 'typeorm';

/** How a campaign's / photoshoot's images are made: 'exact' (cut-out product, new background) or 'ai' (full AI). */
export class AddMarketingImageMode1700000000008 implements MigrationInterface {
  name = 'AddMarketingImageMode1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "image_mode" varchar(10) NOT NULL DEFAULT 'exact'`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketing_photoshoots" ADD COLUMN IF NOT EXISTS "image_mode" varchar(10) NOT NULL DEFAULT 'exact'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "marketing_photoshoots" DROP COLUMN IF EXISTS "image_mode"`);
    await queryRunner.query(`ALTER TABLE "marketing_campaigns" DROP COLUMN IF EXISTS "image_mode"`);
  }
}
