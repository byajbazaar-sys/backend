import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTryOnAssetsTable1778500000000 implements MigrationInterface {
  name = 'CreateTryOnAssetsTable1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "try_on_assets" (
        "id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "image_key" varchar(512) NOT NULL,
        "label" varchar(255),
        "height_in_inches" numeric(6,2),
        "color" varchar(64),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_try_on_assets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_try_on_assets_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_try_on_assets_created_by_type_created_at" ON "try_on_assets" ("created_by", "type", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_try_on_assets_created_by_type_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "try_on_assets"`);
  }
}
