import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kaggle API keys are stored as plain text from now on: api_key_encrypted → api_key. Rows still holding the old
 * AES-256-GCM ciphertext (`v1.…`) are decrypted and rewritten by KaggleCredentialsRepository the first time it reads
 * them (SQL cannot decrypt them).
 */
export class PlainKaggleApiKeys1700000000010 implements MigrationInterface {
  name = 'PlainKaggleApiKeys1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'kaggle_credentials' AND column_name = 'api_key_encrypted') THEN
          ALTER TABLE "kaggle_credentials" RENAME COLUMN "api_key_encrypted" TO "api_key";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kaggle_credentials" RENAME COLUMN "api_key" TO "api_key_encrypted"`);
  }
}
