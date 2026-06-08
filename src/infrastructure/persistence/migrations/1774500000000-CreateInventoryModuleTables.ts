import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryModuleTables1774500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "e_seed_type_enum" ADD VALUE IF NOT EXISTS 'inventory_categories'`,
    );

    await queryRunner.query(
      `CREATE TYPE "e_metal_type_enum" AS ENUM ('GOLD', 'SILVER', 'PLATINUM', 'DIAMOND', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "e_inventory_item_status_enum" AS ENUM ('AVAILABLE', 'SOLD', 'RESERVED', 'DAMAGED', 'IN_REPAIR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "e_pos_session_status_enum" AS ENUM ('CREATED', 'CONNECTED', 'EXPIRED', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "e_device_type_enum" AS ENUM ('DESKTOP', 'MOBILE')`,
    );

    await queryRunner.query(`
      CREATE TABLE "inventory_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" varchar(500),
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_categories_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_inventory_categories_name_created_by" UNIQUE ("name", "created_by")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "sku" varchar(20) NOT NULL,
        "barcode" varchar(20) NOT NULL,
        "item_code" varchar(50),
        "item_name" varchar(255) NOT NULL,
        "description" text,
        "category_id" uuid NOT NULL,
        "metal_type" "e_metal_type_enum" NOT NULL,
        "purity" varchar(50),
        "gross_weight" numeric(10,3) NOT NULL DEFAULT 0,
        "net_weight" numeric(10,3) NOT NULL DEFAULT 0,
        "stone_weight" numeric(10,3) NOT NULL DEFAULT 0,
        "making_charges" numeric(12,2) NOT NULL DEFAULT 0,
        "wastage_percentage" numeric(5,2) NOT NULL DEFAULT 0,
        "purchase_price" numeric(12,2) NOT NULL DEFAULT 0,
        "selling_price" numeric(12,2) NOT NULL DEFAULT 0,
        "status" "e_inventory_item_status_enum" NOT NULL DEFAULT 'AVAILABLE',
        "image_urls" jsonb NOT NULL DEFAULT '[]',
        "location" varchar(255),
        "hallmarked" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_items_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inventory_items_category_id" FOREIGN KEY ("category_id") REFERENCES "inventory_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_inventory_items_sku" UNIQUE ("sku"),
        CONSTRAINT "UQ_inventory_items_barcode" UNIQUE ("barcode")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_inventory_items_created_by" ON "inventory_items" ("created_by")`);
    await queryRunner.query(`CREATE INDEX "IDX_inventory_items_category_id" ON "inventory_items" ("category_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_inventory_items_status" ON "inventory_items" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "pos_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "session_code" varchar(32) NOT NULL,
        "status" "e_pos_session_status_enum" NOT NULL DEFAULT 'CREATED',
        "expires_at" TIMESTAMP NOT NULL,
        "desktop_connection_id" varchar(128),
        "mobile_connection_id" varchar(128),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pos_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pos_sessions_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_pos_sessions_session_code" UNIQUE ("session_code")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_pos_sessions_created_by" ON "pos_sessions" ("created_by")`);
    await queryRunner.query(`CREATE INDEX "IDX_pos_sessions_status" ON "pos_sessions" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "websocket_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "connection_id" varchar(128) NOT NULL,
        "session_id" uuid,
        "user_id" uuid NOT NULL,
        "device_type" "e_device_type_enum" NOT NULL,
        "connected_at" TIMESTAMP NOT NULL DEFAULT now(),
        "disconnected_at" TIMESTAMP,
        CONSTRAINT "PK_websocket_connections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_websocket_connections_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_websocket_connections_connection_id" UNIQUE ("connection_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_websocket_connections_session_id" ON "websocket_connections" ("session_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_websocket_connections_user_id" ON "websocket_connections" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "websocket_connections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pos_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_categories"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_device_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_pos_session_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_inventory_item_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_metal_type_enum"`);
  }
}
