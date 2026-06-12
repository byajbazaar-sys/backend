import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGstInvoiceFields1775000000000 implements MigrationInterface {
  name = 'AddGstInvoiceFields1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "gstin" varchar(15),
        ADD COLUMN IF NOT EXISTS "pan" varchar(10),
        ADD COLUMN IF NOT EXISTS "state" varchar(100),
        ADD COLUMN IF NOT EXISTS "state_code" varchar(2),
        ADD COLUMN IF NOT EXISTS "proprietor_name" varchar(255),
        ADD COLUMN IF NOT EXISTS "shop_logo_ref" varchar(500),
        ADD COLUMN IF NOT EXISTS "alternate_phone_number" varchar(20),
        ADD COLUMN IF NOT EXISTS "bank_name" varchar(255),
        ADD COLUMN IF NOT EXISTS "bank_branch" varchar(255),
        ADD COLUMN IF NOT EXISTS "bank_account_number" varchar(50),
        ADD COLUMN IF NOT EXISTS "bank_ifsc" varchar(20)
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_categories"
        ADD COLUMN IF NOT EXISTS "hsn_code" varchar(8)
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_bills"
        ADD COLUMN IF NOT EXISTS "customer_address" varchar(500),
        ADD COLUMN IF NOT EXISTS "customer_state" varchar(100),
        ADD COLUMN IF NOT EXISTS "customer_state_code" varchar(2),
        ADD COLUMN IF NOT EXISTS "customer_gstin" varchar(15),
        ADD COLUMN IF NOT EXISTS "customer_pan" varchar(10),
        ADD COLUMN IF NOT EXISTS "customer_prop_name" varchar(255),
        ADD COLUMN IF NOT EXISTS "cgst_rate" numeric(5,2) NOT NULL DEFAULT 1.5,
        ADD COLUMN IF NOT EXISTS "sgst_rate" numeric(5,2) NOT NULL DEFAULT 1.5,
        ADD COLUMN IF NOT EXISTS "cgst_amount" numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "sgst_amount" numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "round_off" numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "gold_rate24k" numeric(12,2)
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
        ADD COLUMN IF NOT EXISTS "hsn_code" varchar(8),
        ADD COLUMN IF NOT EXISTS "huid" varchar(50),
        ADD COLUMN IF NOT EXISTS "less_weight" numeric(10,3)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bill_items"
        DROP COLUMN IF EXISTS "less_weight",
        DROP COLUMN IF EXISTS "huid",
        DROP COLUMN IF EXISTS "hsn_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_bills"
        DROP COLUMN IF EXISTS "gold_rate24k",
        DROP COLUMN IF EXISTS "round_off",
        DROP COLUMN IF EXISTS "sgst_amount",
        DROP COLUMN IF EXISTS "cgst_amount",
        DROP COLUMN IF EXISTS "sgst_rate",
        DROP COLUMN IF EXISTS "cgst_rate",
        DROP COLUMN IF EXISTS "customer_prop_name",
        DROP COLUMN IF EXISTS "customer_pan",
        DROP COLUMN IF EXISTS "customer_gstin",
        DROP COLUMN IF EXISTS "customer_state_code",
        DROP COLUMN IF EXISTS "customer_state",
        DROP COLUMN IF EXISTS "customer_address"
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_categories"
        DROP COLUMN IF EXISTS "hsn_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "bank_ifsc",
        DROP COLUMN IF EXISTS "bank_account_number",
        DROP COLUMN IF EXISTS "bank_branch",
        DROP COLUMN IF EXISTS "bank_name",
        DROP COLUMN IF EXISTS "alternate_phone_number",
        DROP COLUMN IF EXISTS "shop_logo_ref",
        DROP COLUMN IF EXISTS "proprietor_name",
        DROP COLUMN IF EXISTS "state_code",
        DROP COLUMN IF EXISTS "state",
        DROP COLUMN IF EXISTS "pan",
        DROP COLUMN IF EXISTS "gstin"
    `);
  }
}
