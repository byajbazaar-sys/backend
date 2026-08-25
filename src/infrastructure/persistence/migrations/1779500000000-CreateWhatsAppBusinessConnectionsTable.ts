import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsAppBusinessConnectionsTable1779500000000 implements MigrationInterface {
  name = 'CreateWhatsAppBusinessConnectionsTable1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "whatsapp_business_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "waba_id" varchar(64) NOT NULL,
        "phone_number_id" varchar(64) NOT NULL,
        "display_phone_number" varchar(32),
        "business_name" varchar(255),
        "connection_status" varchar(32) NOT NULL DEFAULT 'pending',
        "access_token_reference" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_business_connections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_whatsapp_business_connections_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_whatsapp_business_connections_user_id" ON "whatsapp_business_connections" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_whatsapp_business_connections_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_business_connections"`);
  }
}
