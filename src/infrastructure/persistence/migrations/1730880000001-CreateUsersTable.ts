import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1730880000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "first_name" varchar(100),
        "last_name" varchar(100),
        "email" varchar(255) NOT NULL,
        "phone_number" varchar(20),
        "password" varchar(255) NOT NULL,
        "is_email_verified" boolean NOT NULL DEFAULT false,
        "email_verified_at" TIMESTAMP WITH TIME ZONE,
        "reset_password_token" varchar(255),
        "reset_password_expires" TIMESTAMP WITH TIME ZONE,
        "email_verification_token" varchar(255),
        "email_verification_expires" TIMESTAMP WITH TIME ZONE,
        "user_type" "e_user_type_enum" NOT NULL DEFAULT 'user',
        "profile_photo_ref" varchar(500),
        "business_name" varchar(255),
        "address" varchar(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
