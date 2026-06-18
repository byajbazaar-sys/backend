import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentTypeToSalesBills1775600000000 implements MigrationInterface {
  name = 'AddDocumentTypeToSalesBills1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "e_document_type_enum" AS ENUM ('NORMAL_BILL', 'INFORMAL_BILL');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_bills"
        ADD COLUMN IF NOT EXISTS "document_type" "e_document_type_enum" NOT NULL DEFAULT 'NORMAL_BILL'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sales_bills_document_type"
        ON "sales_bills" ("document_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sales_bills_document_type"`);
    await queryRunner.query(`ALTER TABLE "sales_bills" DROP COLUMN IF EXISTS "document_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_document_type_enum"`);
  }
}
