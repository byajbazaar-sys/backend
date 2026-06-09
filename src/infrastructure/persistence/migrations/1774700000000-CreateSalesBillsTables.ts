import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSalesBillsTables1774700000000 implements MigrationInterface {
  name = 'CreateSalesBillsTables1774700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "e_payment_mode_enum" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER')
    `);
    await queryRunner.query(`
      CREATE TYPE "e_bill_status_enum" AS ENUM ('COMPLETED', 'CANCELLED', 'REFUNDED')
    `);
    await queryRunner.query(`
      CREATE TABLE "sales_bills" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "bill_number" varchar(32) NOT NULL,
        "customer_name" varchar(255) NOT NULL DEFAULT 'Walk-in',
        "customer_mobile" varchar(20),
        "customer_id" uuid,
        "subtotal" numeric(14,2) NOT NULL DEFAULT 0,
        "discount" numeric(14,2) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "grand_total" numeric(14,2) NOT NULL DEFAULT 0,
        "payment_mode" "e_payment_mode_enum" NOT NULL DEFAULT 'CASH',
        "status" "e_bill_status_enum" NOT NULL DEFAULT 'COMPLETED',
        "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_bills" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sales_bills_number_user" UNIQUE ("created_by", "bill_number")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sales_bills_bill_number" ON "sales_bills" ("bill_number")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sales_bills_customer_name" ON "sales_bills" ("customer_name")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sales_bills_customer_mobile" ON "sales_bills" ("customer_mobile")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sales_bills_created_at" ON "sales_bills" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sales_bills_created_by" ON "sales_bills" ("created_by")
    `);
    await queryRunner.query(`
      CREATE TABLE "sales_bill_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bill_id" uuid NOT NULL,
        "inventory_item_id" uuid,
        "item_name" varchar(255) NOT NULL,
        "sku" varchar(20) NOT NULL,
        "barcode" varchar(20),
        "metal_type" varchar(32),
        "purity" varchar(50),
        "gross_weight" numeric(10,3),
        "net_weight" numeric(10,3),
        "making_charges" numeric(12,2) DEFAULT 0,
        "selling_price" numeric(12,2) NOT NULL DEFAULT 0,
        "quantity" int NOT NULL DEFAULT 1,
        "line_total" numeric(14,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_sales_bill_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_bill_items_bill" FOREIGN KEY ("bill_id") REFERENCES "sales_bills"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sales_bill_items_bill_id" ON "sales_bill_items" ("bill_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_bill_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_bills"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_bill_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_payment_mode_enum"`);
  }
}
