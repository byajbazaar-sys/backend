import { MigrationInterface, QueryRunner } from 'typeorm';

/** Live connections listen to the shop being worked in; members' access decides which events reach them. */
export class AddShopToWebsocketConnections1795000000001 implements MigrationInterface {
  name = 'AddShopToWebsocketConnections1795000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "websocket_connections" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "websocket_connections" ADD COLUMN IF NOT EXISTS "shop_permissions" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "websocket_connections" DROP COLUMN IF EXISTS "shop_permissions"`);
    await queryRunner.query(`ALTER TABLE "websocket_connections" DROP COLUMN IF EXISTS "actor_user_id"`);
  }
}
