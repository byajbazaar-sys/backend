import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomersTable1730880000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "first_name" varchar(100) NOT NULL,
        "middle_name" varchar(100),
        "last_name" varchar(100) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phone" varchar(50),
        "alternative_phone" varchar(50),
        "profile_photo_ref" varchar(500),
        "aadhaar_card_ref" varchar(500),
        "pan_card_ref" varchar(500),
        "location" varchar(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
  }
}
