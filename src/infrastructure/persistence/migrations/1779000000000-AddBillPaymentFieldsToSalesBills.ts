import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillPaymentFieldsToSalesBills1779000000000 implements MigrationInterface {
  name = 'AddBillPaymentFieldsToSalesBills1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bills"
        ADD COLUMN IF NOT EXISTS "amount_received" numeric(14,2),
        ADD COLUMN IF NOT EXISTS "deposit_applied" numeric(14,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bills"
        DROP COLUMN IF EXISTS "amount_received",
        DROP COLUMN IF EXISTS "deposit_applied"
    `);
  }
}
