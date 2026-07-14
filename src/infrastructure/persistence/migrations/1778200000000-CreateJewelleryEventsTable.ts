import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJewelleryEventsTable1778200000000 implements MigrationInterface {
  name = 'CreateJewelleryEventsTable1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "e_jewellery_event_status_enum" AS ENUM ('ACTIVE', 'INACTIVE')
    `);

    await queryRunner.query(`
      CREATE TABLE "jewellery_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(512) NOT NULL,
        "slug" varchar(512) NOT NULL,
        "description" text,
        "start_date" date,
        "end_date" date,
        "city" varchar(128),
        "state" varchar(128),
        "country" varchar(128) DEFAULT 'India',
        "venue" varchar(512),
        "organizer" varchar(512),
        "category" varchar(128),
        "website" varchar(1024),
        "registration_url" varchar(1024),
        "source_url" varchar(1024),
        "visitor_entry_fee" varchar(256),
        "stall_fee" varchar(256),
        "contact_email" varchar(256),
        "contact_phone" varchar(64),
        "tags" jsonb DEFAULT '[]'::jsonb,
        "status" "e_jewellery_event_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "is_featured" boolean NOT NULL DEFAULT false,
        "seo_title" varchar(512),
        "seo_description" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_jewellery_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_jewellery_events_slug" ON "jewellery_events" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jewellery_events_start_date" ON "jewellery_events" ("start_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jewellery_events_state" ON "jewellery_events" ("state")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jewellery_events_city" ON "jewellery_events" ("city")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jewellery_events_status" ON "jewellery_events" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jewellery_events_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jewellery_events_city"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jewellery_events_state"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jewellery_events_start_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_jewellery_events_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jewellery_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_jewellery_event_status_enum"`);
  }
}
