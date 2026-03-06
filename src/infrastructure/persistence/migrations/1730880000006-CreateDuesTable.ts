import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDuesTable1730880000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dues" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "loan_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "due_amount" decimal(15,2) NOT NULL,
        "type" "e_due_type_enum" NOT NULL,
        "due_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_by_id" uuid NOT NULL,
        "principal_amount" decimal(15,2) NOT NULL,
        "interest_amount" decimal(15,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dues" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dues_loan" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dues_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dues_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_dues_loan_due_date" ON "dues" ("loan_id", "due_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_dues_created_by_type" ON "dues" ("created_by_id", "type")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dues"`);
  }
}
