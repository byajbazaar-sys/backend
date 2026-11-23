import { MigrationInterface, QueryRunner } from 'typeorm';

/** Instagram DMs for the customer inbox: the linked Facebook Page (and its token), and lookup by Instagram account. */
export class AddInstagramMessaging1700000000017 implements MigrationInterface {
  name = 'AddInstagramMessaging1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "marketing_instagram_connections" ADD COLUMN IF NOT EXISTS "messaging_page_id" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketing_instagram_connections" ADD COLUMN IF NOT EXISTS "messaging_token_encrypted" text`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_marketing_instagram_connections_ig_user" ON "marketing_instagram_connections" ("instagram_user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_marketing_instagram_connections_ig_user"`);
    await queryRunner.query(
      `ALTER TABLE "marketing_instagram_connections" DROP COLUMN IF EXISTS "messaging_token_encrypted"`,
    );
    await queryRunner.query(`ALTER TABLE "marketing_instagram_connections" DROP COLUMN IF EXISTS "messaging_page_id"`);
  }
}
