import { MigrationInterface, QueryRunner } from 'typeorm';

/** Private Kaggle dataset with every model, built once per account by the setup notebook (mounted by workers). */
export class AddKaggleModelCache1700000000009 implements MigrationInterface {
  name = 'AddKaggleModelCache1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kaggle_accounts" ADD COLUMN IF NOT EXISTS "models_dataset" varchar(200)`);
    await queryRunner.query(`ALTER TABLE "kaggle_accounts" ADD COLUMN IF NOT EXISTS "models_attempt_at" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kaggle_accounts" DROP COLUMN IF EXISTS "models_attempt_at"`);
    await queryRunner.query(`ALTER TABLE "kaggle_accounts" DROP COLUMN IF EXISTS "models_dataset"`);
  }
}
