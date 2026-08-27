import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppReminderSentAtToDues1779800000000 implements MigrationInterface {
  name = 'AddWhatsAppReminderSentAtToDues1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dues"
      ADD COLUMN "whatsapp_reminder_sent_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dues"
      DROP COLUMN IF EXISTS "whatsapp_reminder_sent_at"
    `);
  }
}
