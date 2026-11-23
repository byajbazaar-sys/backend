import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Several shops per account + invited members with roles.
 * - users.owner_user_id: extra shops an owner adds are their own business accounts (all data stays keyed by the
 *   shop's id), owned by the person who created them. The owner's original account is their first shop.
 * - shop_memberships: people invited into a shop, with a role and per-module access.
 * - shop_invites: email invitations (only a hash of the link token is stored).
 */
export class CreateShopMembershipsAndInvites1795000000000 implements MigrationInterface {
  name = 'CreateShopMembershipsAndInvites1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_owner_user_id" ON "users" ("owner_user_id") WHERE "owner_user_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_memberships" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "shop_id" uuid NOT NULL,
        "member_user_id" uuid NOT NULL,
        "role" varchar(20) NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '{}',
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "invited_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shop_memberships_shop" FOREIGN KEY ("shop_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shop_memberships_member" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shop_memberships_shop_member" ON "shop_memberships" ("shop_id", "member_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_memberships_member" ON "shop_memberships" ("member_user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "shop_id" uuid NOT NULL,
        "email" varchar(255) NOT NULL,
        "role" varchar(20) NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '{}',
        "token_hash" varchar(64) NOT NULL,
        "invited_by" uuid NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "accepted_at" TIMESTAMPTZ,
        "accepted_by" uuid,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_invites" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shop_invites_shop" FOREIGN KEY ("shop_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shop_invites_token" ON "shop_invites" ("token_hash")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_invites_shop_open" ON "shop_invites" ("shop_id") WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_invites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_memberships"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_owner_user_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "owner_user_id"`);
  }
}
