import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * whatsapp_messages moves to the logs database (src/logs). Its rows are copied in (updated_at, id) order — updated_at
 * so that a delivery-status change made after a row was copied is copied again — which needs this index.
 * The table itself is kept (it stays the store until its rows are copied, and is the fallback without LOGS_DB_*).
 */
export class IndexWhatsAppMessagesForLogs1794700000000 implements MigrationInterface {
  name = 'IndexWhatsAppMessagesForLogs1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_whatsapp_messages_updated_id" ON "whatsapp_messages" ("updated_at", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_messages_updated_id"`);
  }
}
