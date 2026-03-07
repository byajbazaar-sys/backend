import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsTable1730880000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "loan_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "amount" decimal(15,2) NOT NULL,
        "transaction_type" "e_transaction_type_enum" NOT NULL,
        "paid_in" "e_transaction_paid_in_enum" NOT NULL,
        "paid_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_by" uuid NOT NULL,
        "due_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transactions_loan" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transactions_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transactions_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transactions_due" FOREIGN KEY ("due_id") REFERENCES "dues"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
  }
}
