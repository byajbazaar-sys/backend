import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReengagementTemplateLanguageToWhatsAppConnections1780100000000 implements MigrationInterface {
  name = 'AddReengagementTemplateLanguageToWhatsAppConnections1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      ADD COLUMN "reengagement_template_language" varchar(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      DROP COLUMN IF EXISTS "reengagement_template_language"
    `);
  }
}
