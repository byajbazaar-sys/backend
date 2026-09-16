import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional business payment date for display/receipts only.
 * NULL means "use created_at" — existing rows and new rows without back-date behave unchanged.
 */
export class AddTransactionPaidAtNullable1791500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "paid_at"`);
  }
}
