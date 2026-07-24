import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDepositTables1778700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "e_deposit_status_enum" AS ENUM ('Active', 'Closed', 'Refunded')
    `);
    await queryRunner.query(`
      CREATE TYPE "e_deposit_transaction_type_enum" AS ENUM ('Deposit', 'Adjustment', 'Refund')
    `);

    await queryRunner.query(`
      CREATE TABLE "deposit_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deposit_number" varchar(32) NOT NULL,
        "customer_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "name" varchar(255),
        "current_balance" numeric(14,2) NOT NULL DEFAULT 0,
        "total_deposited" numeric(14,2) NOT NULL DEFAULT 0,
        "status" "e_deposit_status_enum" NOT NULL DEFAULT 'Active',
        "notes" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposit_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deposit_accounts_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deposit_accounts_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_deposit_accounts_number_per_user"
      ON "deposit_accounts" ("created_by", "deposit_number")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_deposit_accounts_customer" ON "deposit_accounts" ("customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_deposit_accounts_created_by" ON "deposit_accounts" ("created_by")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_deposit_accounts_status" ON "deposit_accounts" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "deposit_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deposit_account_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "type" "e_deposit_transaction_type_enum" NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "balance_after" numeric(14,2) NOT NULL,
        "payment_mode" varchar(50),
        "transaction_reference" varchar(255),
        "sales_bill_id" uuid,
        "transaction_date" TIMESTAMPTZ NOT NULL,
        "notes" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposit_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deposit_transactions_account" FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deposit_transactions_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deposit_transactions_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deposit_transactions_sales_bill" FOREIGN KEY ("sales_bill_id") REFERENCES "sales_bills"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_deposit_transactions_account" ON "deposit_transactions" ("deposit_account_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_deposit_transactions_date" ON "deposit_transactions" ("transaction_date")
    `);

    await queryRunner.query(`
      CREATE TABLE "deposit_receipts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deposit_transaction_id" uuid NOT NULL,
        "receipt_number" varchar(32) NOT NULL,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposit_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_deposit_receipts_transaction" UNIQUE ("deposit_transaction_id"),
        CONSTRAINT "FK_deposit_receipts_transaction" FOREIGN KEY ("deposit_transaction_id") REFERENCES "deposit_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deposit_receipts_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_receipts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_accounts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_deposit_transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_deposit_status_enum"`);
  }
}
