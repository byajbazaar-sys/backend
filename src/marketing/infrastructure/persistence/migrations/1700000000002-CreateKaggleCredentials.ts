import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kaggle API credentials move from the KAGGLE_WORKERS env var into the marketing database (managed through the admin
 * endpoints). The key is stored encrypted (AES-256-GCM, see MarketingSecretCipher). kaggle_accounts keeps the runtime
 * state (setup status, last error) per username.
 */
export class CreateKaggleCredentials1700000000002 implements MigrationInterface {
  name = 'CreateKaggleCredentials1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kaggle_credentials" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "username" varchar(100) NOT NULL,
        "label" varchar(255),
        "api_key_encrypted" text NOT NULL,
        "concurrency" smallint NOT NULL DEFAULT 1,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kaggle_credentials" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_kaggle_credentials_username" ON "kaggle_credentials" ("username")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "kaggle_credentials"`);
  }
}
