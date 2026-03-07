import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoansTable1730880000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "tenure_type" "e_loan_tenure_type_enum" NOT NULL,
        "tenure_value" integer NOT NULL,
        "interest_calculation_method" "e_interest_calculation_method_enum" NOT NULL,
        "interest_percentage" decimal(10,2) NOT NULL DEFAULT 0,
        "interest_type" "e_interest_type_enum" NOT NULL,
        "amount_paid" decimal(15,2) NOT NULL DEFAULT 0,
        "amount_remaining" decimal(15,2) NOT NULL DEFAULT 0,
        "interest_paid" decimal(15,2) NOT NULL DEFAULT 0,
        "interest_remaining" decimal(15,2) NOT NULL DEFAULT 0,
        "status" "e_loan_status_enum" NOT NULL DEFAULT 'Open',
        "current_rate" decimal(10,2),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loans_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_loans_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "loans"`);
  }
}
