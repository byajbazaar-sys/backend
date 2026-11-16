import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Main-database side of the logs service (src/logs), which stores bill, transaction, WhatsApp message and activity
 * logs in their own database (LOGS_DB_*):
 *  - log_outbox: logs written inside a main-database transaction (atomic with it), or while the logs database is
 *    unreachable, wait here until they are moved to the logs database. Nothing is lost if it is down.
 *  - activity_logs: dues / payments / marketing activity, used when no dedicated logs database is configured.
 *  - (created_at, id) indexes so bill_logs / transaction_logs can be copied to the logs database in batches.
 * bill_logs and transaction_logs are kept: they stay the store until their rows have been copied (see
 * scripts/migrate-logs-to-logs-db.ts), and are the fallback when no logs database is configured.
 */
export class PrepareLogsService1794600000000 implements MigrationInterface {
  name = 'PrepareLogsService1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "log_outbox" (
        "id" uuid NOT NULL,
        "stream" varchar(30) NOT NULL,
        "payload" jsonb NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "last_attempt_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_log_outbox" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_log_outbox_created" ON "log_outbox" ("created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
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
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_created_id" ON "activity_logs" ("created_at", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_user_created" ON "activity_logs" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_entity" ON "activity_logs" ("entity_type", "entity_id", "created_at")`,
    );

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bill_logs_created_id" ON "bill_logs" ("created_at", "id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transaction_logs_created_id" ON "transaction_logs" ("created_at", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transaction_logs_created_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bill_logs_created_id"`);
    // activity_logs and log_outbox may hold rows not yet in the logs database: only drop them when empty.
    for (const table of ['activity_logs', 'log_outbox']) {
      const rows = (await queryRunner.query(`SELECT 1 FROM "${table}" LIMIT 1`)) as unknown[];
      if (rows.length > 0) {
        throw new Error(`${table} is not empty; move its rows to the logs database before reverting`);
      }
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
