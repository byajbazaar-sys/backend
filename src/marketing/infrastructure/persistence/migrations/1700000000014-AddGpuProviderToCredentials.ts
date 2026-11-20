import { MigrationInterface, QueryRunner } from 'typeorm';

/** GPU accounts can be Kaggle (as before) or Colab Enterprise projects (service-account key + settings). */
export class AddGpuProviderToCredentials1700000000014 implements MigrationInterface {
  name = 'AddGpuProviderToCredentials1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kaggle_credentials" ADD COLUMN IF NOT EXISTS "provider" varchar(10) NOT NULL DEFAULT 'kaggle'`,
    );
    await queryRunner.query(`ALTER TABLE "kaggle_credentials" ADD COLUMN IF NOT EXISTS "colab_config" jsonb`);
    // The model cache of a Colab account is a gs:// prefix: longer than a Kaggle dataset ref.
    await queryRunner.query(`ALTER TABLE "kaggle_accounts" ALTER COLUMN "models_dataset" TYPE varchar(400)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kaggle_credentials" DROP COLUMN IF EXISTS "colab_config"`);
    await queryRunner.query(`ALTER TABLE "kaggle_credentials" DROP COLUMN IF EXISTS "provider"`);
  }
}
