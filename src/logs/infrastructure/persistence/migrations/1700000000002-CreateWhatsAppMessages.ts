import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WhatsApp message log (sent messages and their delivery status from Meta's status webhooks), same columns as the
 * main database's whatsapp_messages. Ids are kept when rows are copied over. user_id refers to ByajBazaar users in
 * the main database: no cross-database foreign key, so the history outlives the user.
 */
export class CreateWhatsAppMessages1700000000002 implements MigrationInterface {
  name = 'CreateWhatsAppMessages1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "waba_id" varchar(64) NOT NULL,
        "phone_number_id" varchar(64) NOT NULL,
        "meta_message_id" varchar(255) NOT NULL,
        "recipient" varchar(32) NOT NULL,
        "message_type" varchar(16),
        "template_name" varchar(128),
        "context_type" varchar(32),
        "context_id" uuid,
        "context_label" varchar(255),
        "delivery_status" varchar(16) NOT NULL DEFAULT 'sent',
        "status_timestamp" varchar(32),
        "error_code" integer,
        "error_title" varchar(255),
        "error_message" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_messages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_whatsapp_messages_meta_message_id" ON "whatsapp_messages" ("meta_message_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_whatsapp_messages_user_id_created_at" ON "whatsapp_messages" ("user_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // May hold the only copy of the message history: refuse to drop it while it has rows.
    const rows = (await queryRunner.query(`SELECT 1 FROM "whatsapp_messages" LIMIT 1`)) as unknown[];
    if (rows.length > 0) throw new Error('whatsapp_messages has rows; refusing to drop it (export or move them first)');
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_messages"`);
  }
}
