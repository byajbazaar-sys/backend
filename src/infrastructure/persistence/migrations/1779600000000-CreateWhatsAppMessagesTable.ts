import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsAppMessagesTable1779600000000 implements MigrationInterface {
  name = 'CreateWhatsAppMessagesTable1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "whatsapp_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "waba_id" varchar(64) NOT NULL,
        "phone_number_id" varchar(64) NOT NULL,
        "meta_message_id" varchar(255) NOT NULL,
        "recipient" varchar(32) NOT NULL,
        "delivery_status" varchar(16) NOT NULL DEFAULT 'sent',
        "status_timestamp" varchar(32),
        "error_code" integer,
        "error_title" varchar(255),
        "error_message" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_whatsapp_messages_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_whatsapp_messages_meta_message_id" ON "whatsapp_messages" ("meta_message_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_messages_user_id_meta_message_id" ON "whatsapp_messages" ("user_id", "meta_message_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_messages_waba_phone" ON "whatsapp_messages" ("waba_id", "phone_number_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_messages_waba_phone"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_messages_user_id_meta_message_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_whatsapp_messages_meta_message_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_messages"`);
  }
}
