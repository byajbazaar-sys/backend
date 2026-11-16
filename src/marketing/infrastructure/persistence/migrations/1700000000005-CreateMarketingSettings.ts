import { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin-editable marketing settings (e.g. Kaggle auto-recovery), one JSON value per key. */
export class CreateMarketingSettings1700000000005 implements MigrationInterface {
  name = 'CreateMarketingSettings1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_settings" (
        "key" varchar(64) NOT NULL,
        "value" jsonb NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_settings" PRIMARY KEY ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_settings"`);
  }
}
