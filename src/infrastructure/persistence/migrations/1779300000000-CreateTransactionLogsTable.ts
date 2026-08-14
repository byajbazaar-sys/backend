import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionLogsTable1779300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "e_transaction_log_action_enum" AS ENUM (
        'CREATE',
        'UPDATE_AMOUNT',
        'UPDATE_PAID_IN',
        'DELETE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "transaction_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transaction_id" uuid,
        "loan_id" uuid NOT NULL,
        "action" "e_transaction_log_action_enum" NOT NULL,
        "transaction_type" "e_transaction_type_enum",
        "previous_amount" decimal(12,2),
        "new_amount" decimal(12,2),
        "previous_paid_in" "e_transaction_paid_in_enum",
        "new_paid_in" "e_transaction_paid_in_enum",
        "loan_version" int,
        "performed_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transaction_logs_transaction"
          FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_transaction_logs_loan"
          FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transaction_logs_performed_by"
          FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_transaction_logs_transaction_id"
        ON "transaction_logs" ("transaction_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_transaction_logs_loan_id_created_at"
        ON "transaction_logs" ("loan_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_transaction_log_action_enum"`);
  }
}
