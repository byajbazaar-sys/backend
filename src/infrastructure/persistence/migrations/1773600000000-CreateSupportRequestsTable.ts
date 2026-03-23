import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportRequestsTable1773600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "support_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        "mobile" varchar(32) NOT NULL,
        "message" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_support_requests_created_at" ON "support_requests" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_support_requests_email" ON "support_requests" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "support_requests"`);
  }
}
