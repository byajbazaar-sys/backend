import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameGoldRate24kColumn1775100000000 implements MigrationInterface {
  name = 'RenameGoldRate24kColumn1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sales_bills' AND column_name = 'gold_rate_24k'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sales_bills' AND column_name = 'gold_rate24k'
        ) THEN
          ALTER TABLE "sales_bills" RENAME COLUMN "gold_rate_24k" TO "gold_rate24k";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sales_bills' AND column_name = 'gold_rate24k'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sales_bills' AND column_name = 'gold_rate_24k'
        ) THEN
          ALTER TABLE "sales_bills" RENAME COLUMN "gold_rate24k" TO "gold_rate_24k";
        END IF;
      END $$;
    `);
  }
}
