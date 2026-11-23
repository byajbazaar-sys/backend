import { MigrationInterface, QueryRunner } from 'typeorm';

/** Customer chat automation (WhatsApp / Instagram inbox, bot replies, owner hand-over) and mobile push devices. */
export class CreateCustomerInbox1794900000000 implements MigrationInterface {
  name = 'CreateCustomerInbox1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inbox_settings" (
        "user_id" uuid NOT NULL,
        "whatsapp_enabled" boolean NOT NULL DEFAULT false,
        "instagram_enabled" boolean NOT NULL DEFAULT false,
        "answer_shop_info" boolean NOT NULL DEFAULT true,
        "answer_rates" boolean NOT NULL DEFAULT true,
        "answer_catalogue" boolean NOT NULL DEFAULT true,
        "answer_account" boolean NOT NULL DEFAULT true,
        "business_hours" varchar(300),
        "about" text,
        "faqs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "instructions" text,
        "handoff_message" varchar(500),
        "notify_email" boolean NOT NULL DEFAULT true,
        "notify_push" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_settings" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_inbox_settings_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "inbox_conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "channel" varchar(20) NOT NULL,
        "external_user_id" varchar(64) NOT NULL,
        "customer_name" varchar(255),
        "customer_id" uuid,
        "state" varchar(20) NOT NULL DEFAULT 'auto',
        "unread_count" integer NOT NULL DEFAULT 0,
        "last_message_at" TIMESTAMPTZ,
        "last_inbound_at" TIMESTAMPTZ,
        "last_message_preview" varchar(300),
        "needs_reply_since" TIMESTAMPTZ,
        "handoff_reason" varchar(200),
        "last_owner_reply_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inbox_conversations_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_inbox_conversations_customer" ON "inbox_conversations" ("user_id", "channel", "external_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_conversations_user_last" ON "inbox_conversations" ("user_id", "last_message_at")`,
    );
    await queryRunner.query(`
      CREATE TABLE "inbox_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "author" varchar(20) NOT NULL,
        "text" text NOT NULL,
        "external_message_id" varchar(255),
        "status" varchar(20) NOT NULL,
        "error" text,
        "bot_handled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inbox_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "inbox_conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inbox_messages_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_messages_conversation_created" ON "inbox_messages" ("conversation_id", "created_at")`,
    );
    // A webhook delivered twice must not store (or answer) the same customer message twice.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_inbox_messages_external" ON "inbox_messages" ("conversation_id", "external_message_id") WHERE "external_message_id" IS NOT NULL`,
    );
    await queryRunner.query(`
      CREATE TABLE "push_devices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token" varchar(255) NOT NULL,
        "platform" varchar(20),
        "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_push_devices_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_push_devices_token" ON "push_devices" ("token")`);
    await queryRunner.query(`CREATE INDEX "IDX_push_devices_user" ON "push_devices" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_devices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_conversations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_settings"`);
  }
}
