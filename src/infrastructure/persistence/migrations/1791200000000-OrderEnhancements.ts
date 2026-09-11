import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderEnhancements1791200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "estimated_amount" numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN "final_amount" numeric(14,2)
    `);
    await queryRunner.query(`
      UPDATE "orders" SET "estimated_amount" = "total_amount" WHERE "estimated_amount" = 0
    `);

    await queryRunner.query(`
      CREATE TABLE "user_permissions" (
        "user_id" uuid NOT NULL,
        "permission" varchar(64) NOT NULL,
        "granted_by" uuid NOT NULL,
        CONSTRAINT "PK_user_permissions" PRIMARY KEY ("user_id", "permission"),
        CONSTRAINT "FK_user_permissions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_permissions_granted_by" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_permissions_user" ON "user_permissions" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "order_attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "storage_key" varchar(512) NOT NULL,
        "filename" varchar(255),
        "mime_type" varchar(128),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_attachments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_attachments_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_attachments_order" ON "order_attachments" ("order_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_attachments_order"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_attachments"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_permissions_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_permissions"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "final_amount",
      DROP COLUMN IF EXISTS "estimated_amount"
    `);
  }
}
