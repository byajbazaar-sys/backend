import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDueRemindersEnabledToWhatsAppConnections1779700000000 implements MigrationInterface {
  name = 'AddDueRemindersEnabledToWhatsAppConnections1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      ADD COLUMN "due_reminders_enabled" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      DROP COLUMN IF EXISTS "due_reminders_enabled"
    `);
  }
}
