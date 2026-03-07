import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoanItemsTable1730880000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loan_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "loan_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "amount" decimal(15,2) NOT NULL,
        "item_name" varchar(255) NOT NULL,
        "item_description" varchar(500),
        "net_weight_in_grams" decimal(12,4) NOT NULL,
        "gross_weight_in_grams" decimal(12,4) NOT NULL,
        "image_ref" varchar(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loan_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loan_items_loan" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_loan_items_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_loan_items_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "loan_items"`);
  }
}
