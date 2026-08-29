import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveReengagementTemplateFromWhatsAppConnections1780200000000 implements MigrationInterface {
  name = 'RemoveReengagementTemplateFromWhatsAppConnections1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      DROP COLUMN IF EXISTS "reengagement_template_language",
      DROP COLUMN IF EXISTS "reengagement_template_name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      ADD COLUMN "reengagement_template_name" varchar(512),
      ADD COLUMN "reengagement_template_language" varchar(16)
    `);
  }
}
