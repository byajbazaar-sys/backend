import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReengagementTemplateNameToWhatsAppConnections1780000000000 implements MigrationInterface {
  name = 'AddReengagementTemplateNameToWhatsAppConnections1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      ADD COLUMN "reengagement_template_name" varchar(512)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_business_connections"
      DROP COLUMN IF EXISTS "reengagement_template_name"
    `);
  }
}
