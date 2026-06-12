import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShowBankDetailsOnBill1775500000000 implements MigrationInterface {
  name = 'AddShowBankDetailsOnBill1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "show_bank_details_on_bill" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "show_bank_details_on_bill"
    `);
  }
}
