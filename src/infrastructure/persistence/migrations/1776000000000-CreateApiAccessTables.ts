import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiAccessTables1776000000000 implements MigrationInterface {
  name = 'CreateApiAccessTables1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_configurations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "api_key" varchar(64) NOT NULL,
        "api_secret_hash" varchar(255) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_configurations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_api_configurations_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_api_configurations_user_id" ON "api_configurations" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_api_configurations_api_key" ON "api_configurations" ("api_key")`,
    );

    await queryRunner.query(`
      CREATE TABLE "api_access_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "api_configuration_id" uuid NOT NULL,
        "access_token_hash" varchar(64) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "last_used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "revoked_at" TIMESTAMPTZ,
        "device_name" varchar(120),
        "client_name" varchar(120),
        CONSTRAINT "PK_api_access_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_api_access_tokens_configuration_id" FOREIGN KEY ("api_configuration_id") REFERENCES "api_configurations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_api_access_tokens_hash" ON "api_access_tokens" ("access_token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_api_access_tokens_configuration_id" ON "api_access_tokens" ("api_configuration_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_access_tokens_configuration_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_access_tokens_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_access_tokens"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_api_configurations_api_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_api_configurations_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_configurations"`);
  }
}
