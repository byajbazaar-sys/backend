import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRateClearedToSalesBillItems1795000000002 implements MigrationInterface {
  name = 'AddRateClearedToSalesBillItems1795000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
      ADD COLUMN IF NOT EXISTS "rate_per_gram_cleared" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_bill_items" DROP COLUMN IF EXISTS "rate_per_gram_cleared"`);
  }
}
