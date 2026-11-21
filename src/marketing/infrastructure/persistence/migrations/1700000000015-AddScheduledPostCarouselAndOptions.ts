import { MigrationInterface, QueryRunner } from 'typeorm';

/** Carousel posts (2–10 items), Instagram publishing options, and a warning for after-publish steps. */
export class AddScheduledPostCarouselAndOptions1700000000015 implements MigrationInterface {
  name = 'AddScheduledPostCarouselAndOptions1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "marketing_scheduled_posts" ADD COLUMN IF NOT EXISTS "items" jsonb`);
    await queryRunner.query(`ALTER TABLE "marketing_scheduled_posts" ADD COLUMN IF NOT EXISTS "options" jsonb`);
    await queryRunner.query(`ALTER TABLE "marketing_scheduled_posts" ADD COLUMN IF NOT EXISTS "warning" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "marketing_scheduled_posts" DROP COLUMN IF EXISTS "warning"`);
    await queryRunner.query(`ALTER TABLE "marketing_scheduled_posts" DROP COLUMN IF EXISTS "options"`);
    await queryRunner.query(`ALTER TABLE "marketing_scheduled_posts" DROP COLUMN IF EXISTS "items"`);
  }
}
