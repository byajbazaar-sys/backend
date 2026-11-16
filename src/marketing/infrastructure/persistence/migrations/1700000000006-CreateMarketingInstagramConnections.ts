import { MigrationInterface, QueryRunner } from 'typeorm';

/** Instagram Business Login state and encrypted account tokens, stored only in the marketing database. */
export class CreateMarketingInstagramConnections1700000000006 implements MigrationInterface {
  name = 'CreateMarketingInstagramConnections1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketing_instagram_connections" (
        "user_id" uuid NOT NULL,
        "instagram_user_id" varchar(64),
        "username" varchar(255),
        "access_token_encrypted" text,
        "token_expires_at" TIMESTAMP WITH TIME ZONE,
        "connected_at" TIMESTAMP WITH TIME ZONE,
        "oauth_state_hash" varchar(64),
        "oauth_state_expires_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketing_instagram_connections" PRIMARY KEY ("user_id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_marketing_instagram_connections_state_hash" ON "marketing_instagram_connections" ("oauth_state_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "marketing_instagram_connections"`);
  }
}
