import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit trail for bills: every create, edit (field-by-field), conversion, delete, print and share.
 * bill_id has no foreign key on purpose: a deleted bill's history stays linked to its id.
 */
export class CreateBillLogsTable1794000000000 implements MigrationInterface {
  name = 'CreateBillLogsTable1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bill_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bill_id" uuid,
        "bill_number" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "action" varchar(40) NOT NULL,
        "changes" jsonb NOT NULL DEFAULT '[]',
        "snapshot" jsonb,
        "channel" varchar(20),
        "performed_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bill_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bill_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bill_logs_performed_by" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bill_logs_bill_created" ON "bill_logs" ("bill_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bill_logs_user_created" ON "bill_logs" ("user_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bill_logs"`);
  }
}
