import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Logs database schema. Same rows as the main database's bill_logs / transaction_logs (ids are kept when they are
 * copied over) plus activity_logs for dues, payments and marketing. user_id / loan_id / bill_id / performed_by refer
 * to rows in the main database: there are no cross-database foreign keys, so history outlives what it describes.
 * logs_sync_state tracks the copy of each stream from the main database (see LegacyLogsCopier).
 */
export class CreateLogsSchema1700000000001 implements MigrationInterface {
  name = 'CreateLogsSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bill_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "bill_id" uuid,
        "bill_number" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "action" varchar(40) NOT NULL,
        "changes" jsonb NOT NULL DEFAULT '[]',
        "snapshot" jsonb,
        "channel" varchar(20),
        "performed_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bill_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bill_logs_bill_created" ON "bill_logs" ("bill_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bill_logs_user_created" ON "bill_logs" ("user_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "transaction_id" uuid,
        "loan_id" uuid NOT NULL,
        "user_id" uuid,
        "action" varchar(30) NOT NULL,
        "transaction_type" varchar(30),
        "previous_amount" numeric(12,2),
        "new_amount" numeric(12,2),
        "previous_paid_in" varchar(30),
        "new_paid_in" varchar(30),
        "loan_version" integer,
        "performed_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transaction_logs_transaction_created" ON "transaction_logs" ("transaction_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transaction_logs_loan_created" ON "transaction_logs" ("loan_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transaction_logs_user_created" ON "transaction_logs" ("user_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category" varchar(20) NOT NULL,
        "action" varchar(60) NOT NULL,
        "entity_type" varchar(40) NOT NULL,
        "entity_id" varchar(128),
        "user_id" uuid,
        "performed_by" uuid,
        "channel" varchar(20),
        "data" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activity_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_category_created" ON "activity_logs" ("category", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_user_created" ON "activity_logs" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_entity" ON "activity_logs" ("entity_type", "entity_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "logs_sync_state" (
        "stream" varchar(30) NOT NULL,
        "cursor_created_at" varchar(40),
        "cursor_id" uuid,
        "copied" bigint NOT NULL DEFAULT 0,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_logs_sync_state" PRIMARY KEY ("stream")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // These tables may hold the only copy of the logs: refuse to drop any that has rows.
    for (const table of ['activity_logs', 'transaction_logs', 'bill_logs']) {
      const exists = (await queryRunner.query(`SELECT to_regclass($1) IS NOT NULL AS "exists"`, [
        `public.${table}`,
      ])) as { exists: boolean }[];
      if (!exists[0]?.exists) continue;
      const rows = (await queryRunner.query(`SELECT 1 FROM "${table}" LIMIT 1`)) as unknown[];
      if (rows.length > 0) throw new Error(`${table} has rows; refusing to drop it (export or move them first)`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "logs_sync_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bill_logs"`);
  }
}
