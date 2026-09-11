import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrdersTables1791000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "e_order_type_enum" AS ENUM (
        'CUSTOM_MAKING',
        'REPAIR',
        'PRODUCT_ORDER',
        'EXCHANGE',
        'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "e_order_status_enum" AS ENUM (
        'NEW',
        'CONFIRMED',
        'IN_PROGRESS',
        'READY',
        'DELIVERED',
        'COMPLETED',
        'ON_HOLD',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "e_order_priority_enum" AS ENUM ('NORMAL', 'HIGH', 'URGENT')
    `);
    await queryRunner.query(`
      CREATE TYPE "e_order_activity_type_enum" AS ENUM (
        'CREATED',
        'STATUS_CHANGED',
        'UPDATED',
        'NOTE_ADDED',
        'ADVANCE_PAYMENT',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_number" varchar(32) NOT NULL,
        "customer_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "assigned_to" uuid,
        "order_type" "e_order_type_enum" NOT NULL,
        "status" "e_order_status_enum" NOT NULL DEFAULT 'NEW',
        "priority" "e_order_priority_enum" NOT NULL DEFAULT 'NORMAL',
        "title" varchar(255),
        "description" text,
        "due_date" TIMESTAMPTZ,
        "total_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "paid_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "notes" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_orders_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_orders_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_orders_number_per_user"
      ON "orders" ("created_by", "order_number")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_created_by_status" ON "orders" ("created_by", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_created_by_order_type" ON "orders" ("created_by", "order_type")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_customer" ON "orders" ("customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_assigned_to" ON "orders" ("assigned_to")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_due_date" ON "orders" ("due_date")
    `);

    await queryRunner.query(`
      CREATE TABLE "order_activities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "activity_type" "e_order_activity_type_enum" NOT NULL,
        "message" text,
        "from_status" "e_order_status_enum",
        "to_status" "e_order_status_enum",
        "amount" numeric(14,2),
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_activities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_activities_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_activities_user" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_activities_order_created_at"
      ON "order_activities" ("order_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_activities_created_by"
      ON "order_activities" ("created_by")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_activities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_order_activity_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_order_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_order_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_order_type_enum"`);
  }
}
