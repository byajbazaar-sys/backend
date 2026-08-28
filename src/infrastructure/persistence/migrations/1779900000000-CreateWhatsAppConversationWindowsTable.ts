import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsAppConversationWindowsTable1779900000000 implements MigrationInterface {
  name = 'CreateWhatsAppConversationWindowsTable1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "whatsapp_conversation_windows" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "waba_id" varchar(64) NOT NULL,
        "phone_number_id" varchar(64) NOT NULL,
        "recipient" varchar(32) NOT NULL,
        "last_inbound_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_conversation_windows" PRIMARY KEY ("id"),
        CONSTRAINT "FK_whatsapp_conversation_windows_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_whatsapp_conversation_windows_scope"
      ON "whatsapp_conversation_windows" ("user_id", "waba_id", "phone_number_id", "recipient")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_whatsapp_conversation_windows_scope"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_conversation_windows"`);
  }
}
