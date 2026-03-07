import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateItemsTable1730880000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" varchar(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_items_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "items"`);
  }
}
