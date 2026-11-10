import { MigrationInterface, QueryRunner } from 'typeorm';

export class LabelDesignerSettings1793600248586 implements MigrationInterface {
  name = 'LabelDesignerSettings1793600248586';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "label_designer_settings" (
        "user_id" uuid NOT NULL,
        "schema_version" integer NOT NULL DEFAULT 1,
        "templates" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "printer_profiles" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_label_designer_settings_user_id" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_label_designer_settings_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "label_designer_settings"');
  }
}
