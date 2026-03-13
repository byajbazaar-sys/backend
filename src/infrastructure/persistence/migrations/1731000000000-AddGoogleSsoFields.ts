import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleSsoFields1731000000000 implements MigrationInterface {
  name = 'AddGoogleSsoFields1731000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN "google_id" varchar(255) NULL,
      ADD COLUMN "is_google_user" boolean DEFAULT false NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_google_id" ON "users" ("google_id") 
      WHERE "google_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_google_id"`);
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN "google_id",
      DROP COLUMN "is_google_user"
    `);
  }
}
