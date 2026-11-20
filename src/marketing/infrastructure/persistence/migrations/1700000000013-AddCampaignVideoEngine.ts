import { MigrationInterface, QueryRunner } from 'typeorm';

/** detailed (Wan 2.2 A14B, the render so far) or fast (Wan 2.2 TI2V-5B) video render per campaign. */
export class AddCampaignVideoEngine1700000000013 implements MigrationInterface {
  name = 'AddCampaignVideoEngine1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "video_engine" varchar(10) NOT NULL DEFAULT 'detailed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "marketing_campaigns" DROP COLUMN IF EXISTS "video_engine"`);
  }
}
