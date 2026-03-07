import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1730880000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel" "e_notification_channel_enum" NOT NULL,
        "recipient" varchar(255) NOT NULL,
        "subject" varchar(500),
        "body" text NOT NULL,
        "status" "e_notification_status_enum" NOT NULL,
        "external_id" varchar(255),
        "metadata" jsonb,
        "error_message" varchar(500),
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
