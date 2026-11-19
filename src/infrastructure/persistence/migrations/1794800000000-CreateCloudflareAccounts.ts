import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cloudflare Workers AI accounts managed in admin (try-on, inventory background removal). Tokens are stored as plain text. */
export class CreateCloudflareAccounts1794800000000 implements MigrationInterface {
  name = 'CreateCloudflareAccounts1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cloudflare_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "label" varchar(100),
        "account_id" varchar(64) NOT NULL,
        "api_token" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "cooldown_until" timestamptz,
        "last_error" varchar(500),
        "last_used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cloudflare_accounts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cloudflare_accounts_account_id" ON "cloudflare_accounts" ("account_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cloudflare_accounts"`);
  }
}
