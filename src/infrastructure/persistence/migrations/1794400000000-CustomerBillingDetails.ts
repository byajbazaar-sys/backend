import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customers keep the billing details a bill collects (GSTIN, PAN, state, state code, firm name),
 * so a customer created from a bill — or picked on the next bill — carries them over.
 * Also indexes customer mobiles per shop for the bill → customer lookup.
 */
export class CustomerBillingDetails1794400000000 implements MigrationInterface {
  name = 'CustomerBillingDetails1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gstin" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "pan_number" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "state" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "state_code" varchar(10)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "prop_name" varchar(255)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customers_created_by_phone" ON "customers" ("created_by", "phone")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_created_by_phone"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "prop_name"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "state_code"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "state"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "pan_number"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "gstin"`);
  }
}
