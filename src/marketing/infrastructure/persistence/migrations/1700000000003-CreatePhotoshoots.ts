import { MigrationInterface, QueryRunner } from 'typeorm';

/** AI photoshoots: one product photo → a set of ad photos (on a model, close-up, hands, worn). */
export class CreatePhotoshoots1700000000003 implements MigrationInterface {
  name = 'CreatePhotoshoots1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_photoshoots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "inventory_item_id" uuid,
        "source_image_key" varchar(500) NOT NULL,
        "piece" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "setting" varchar(20) NOT NULL,
        "model" varchar(10) NOT NULL,
        "outfit" varchar(20) NOT NULL,
        "aspect" varchar(8) NOT NULL,
        "status" varchar(20) NOT NULL,
        "error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_photoshoots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketing_photoshoots_user_created" ON "marketing_photoshoots" ("user_id", "created_at")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_photoshoot_shots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "photoshoot_id" uuid NOT NULL,
        "index" smallint NOT NULL,
        "kind" varchar(20) NOT NULL,
        "prompt" text NOT NULL,
        "image_key" varchar(500),
        "status" varchar(20) NOT NULL,
        "error" text,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_photoshoot_shots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_marketing_photoshoot_shots_photoshoot" FOREIGN KEY ("photoshoot_id")
          REFERENCES "marketing_photoshoots" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_marketing_photoshoot_shots_index" ON "marketing_photoshoot_shots" ("photoshoot_id", "index")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_photoshoot_shots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_photoshoots"`);
  }
}
