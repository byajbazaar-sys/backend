import { MigrationInterface, QueryRunner } from 'typeorm';

/** How the voice says the shop name (Devanagari), for Hindi / Hinglish voiceovers. */
export class AddBrandSpokenName1700000000012 implements MigrationInterface {
  name = 'AddBrandSpokenName1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "marketing_brands" ADD COLUMN IF NOT EXISTS "spoken_name" varchar(160)`);
    await queryRunner.query(`ALTER TABLE "marketing_brands" ADD COLUMN IF NOT EXISTS "spoken_name_for" varchar(255)`);
    await queryRunner.query(
      `ALTER TABLE "marketing_brands" ADD COLUMN IF NOT EXISTS "spoken_name_by_user" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "marketing_brands" DROP COLUMN IF EXISTS "spoken_name_by_user"`);
    await queryRunner.query(`ALTER TABLE "marketing_brands" DROP COLUMN IF EXISTS "spoken_name_for"`);
    await queryRunner.query(`ALTER TABLE "marketing_brands" DROP COLUMN IF EXISTS "spoken_name"`);
  }
}
