import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ByajBazaar AI database: conversations and messages, previews (pending write actions) and their executions,
 * the audit and usage logs, and the knowledge documents index. Runs on the AI database (AI_DB_*, migrations table
 * `ai_migrations`); without one it runs on the main database, where every table is prefixed `ai_`.
 */
export class CreateAiSchema1801000000001 implements MigrationInterface {
  name = 'CreateAiSchema1801000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "actor_user_id" uuid NOT NULL,
        "title" varchar(120),
        "turn_count" integer NOT NULL DEFAULT 0,
        "summary" text,
        "summary_upto_turn" integer NOT NULL DEFAULT 0,
        "last_message_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_conversations" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_conversations_actor" ON "ai_conversations" ("shop_id", "actor_user_id", "last_message_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_conversations_stale" ON "ai_conversations" ("updated_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "turn_index" integer NOT NULL,
        "seq" integer NOT NULL,
        "role" varchar(12) NOT NULL,
        "content" jsonb NOT NULL,
        "client_message_id" varchar(64),
        "response" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_messages_position" ON "ai_messages" ("conversation_id", "turn_index", "seq")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_messages_client_id" ON "ai_messages" ("conversation_id", "client_message_id") WHERE "client_message_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_pending_actions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid,
        "turn_index" integer,
        "shop_id" uuid NOT NULL,
        "actor_user_id" uuid NOT NULL,
        "action" varchar(64) NOT NULL,
        "intent" varchar(16) NOT NULL,
        "parameters" jsonb NOT NULL,
        "preview" jsonb NOT NULL,
        "payload_hash" char(64) NOT NULL,
        "status" varchar(24) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "approved_at" timestamptz,
        "executed_at" timestamptz,
        "completed_at" timestamptz,
        "result" jsonb,
        "error" text,
        "entity_id" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_pending_actions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_pending_actions_conversation" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_pending_actions_actor" ON "ai_pending_actions" ("shop_id", "actor_user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_pending_actions_open" ON "ai_pending_actions" ("conversation_id", "expires_at") WHERE "status" = 'AWAITING_CONFIRMATION'`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_action_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "action_id" uuid NOT NULL,
        "idempotency_key" varchar(100) NOT NULL,
        "status" varchar(16) NOT NULL,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        "result" jsonb,
        "error" text,
        "duration_ms" integer,
        CONSTRAINT "PK_ai_action_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_action_executions_action" FOREIGN KEY ("action_id") REFERENCES "ai_pending_actions"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_action_executions_key" ON "ai_action_executions" ("idempotency_key")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "event" varchar(40) NOT NULL,
        "shop_id" uuid,
        "actor_user_id" uuid,
        "conversation_id" uuid,
        "action_id" uuid,
        "action" varchar(64),
        "data" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_audit_logs" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_audit_logs_shop" ON "ai_audit_logs" ("shop_id", "created_at" DESC)`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_audit_logs_action" ON "ai_audit_logs" ("action_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid,
        "actor_user_id" uuid,
        "conversation_id" uuid,
        "kind" varchar(20) NOT NULL,
        "provider" varchar(20) NOT NULL,
        "model" varchar(80) NOT NULL,
        "input_tokens" integer NOT NULL DEFAULT 0,
        "output_tokens" integer NOT NULL DEFAULT 0,
        "cache_read_tokens" integer NOT NULL DEFAULT 0,
        "cache_write_tokens" integer NOT NULL DEFAULT 0,
        "latency_ms" integer NOT NULL DEFAULT 0,
        "tool_calls" integer NOT NULL DEFAULT 0,
        "outcome" varchar(20) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_usage_logs" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_usage_logs_actor" ON "ai_usage_logs" ("actor_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_usage_logs_shop" ON "ai_usage_logs" ("shop_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_knowledge_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "collection" varchar(40) NOT NULL,
        "doc_key" varchar(120) NOT NULL,
        "shop_id" uuid,
        "title" varchar(200) NOT NULL,
        "language" varchar(12) NOT NULL,
        "source" varchar(12) NOT NULL,
        "storage_key" varchar(300),
        "content_hash" char(64) NOT NULL,
        "chunk_count" integer NOT NULL DEFAULT 0,
        "indexed_version" integer,
        "indexed_at" timestamptz,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_knowledge_documents" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_knowledge_documents_key" ON "ai_knowledge_documents" ("collection", "doc_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_knowledge_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_action_executions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_pending_actions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_conversations"`);
  }
}
