import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppMessageMetadata1791400000000 implements MigrationInterface {
  name = 'AddWhatsAppMessageMetadata1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_messages"
      ADD COLUMN "message_type" varchar(16),
      ADD COLUMN "template_name" varchar(128),
      ADD COLUMN "context_type" varchar(32),
      ADD COLUMN "context_id" uuid,
      ADD COLUMN "context_label" varchar(255)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_whatsapp_messages_user_id_created_at"
      ON "whatsapp_messages" ("user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_messages_user_id_created_at"`);
    await queryRunner.query(`
      ALTER TABLE "whatsapp_messages"
      DROP COLUMN IF EXISTS "context_label",
      DROP COLUMN IF EXISTS "context_id",
      DROP COLUMN IF EXISTS "context_type",
      DROP COLUMN IF EXISTS "template_name",
      DROP COLUMN IF EXISTS "message_type"
    `);
  }
}
