import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentSubscriptionTables1776000000000 implements MigrationInterface {
  name = 'CreatePaymentSubscriptionTables1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "e_coupon_type_enum" AS ENUM ('flat', 'percentage')
    `);

    await queryRunner.query(`
      CREATE TYPE "e_subscription_status_enum" AS ENUM (
        'created',
        'authenticated',
        'active',
        'pending',
        'halted',
        'cancelled',
        'completed',
        'expired',
        'paused'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(64) NOT NULL,
        "type" "e_coupon_type_enum" NOT NULL,
        "value" numeric(12,2) NOT NULL,
        "minimum_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "maximum_discount" numeric(12,2),
        "expiry" TIMESTAMPTZ,
        "maximum_redemption" integer,
        "used_count" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "once_per_user" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_coupons_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "plan_id" varchar(128) NOT NULL,
        "provider" varchar(32) NOT NULL DEFAULT 'razorpay',
        "provider_subscription_id" varchar(128),
        "provider_customer_id" varchar(128),
        "status" "e_subscription_status_enum" NOT NULL DEFAULT 'created',
        "current_start" TIMESTAMPTZ,
        "current_end" TIMESTAMPTZ,
        "next_billing_at" TIMESTAMPTZ,
        "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        "cancelled_at" TIMESTAMPTZ,
        "amount" numeric(12,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'INR',
        "coupon_id" uuid,
        "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "notes" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscriptions_coupon_id" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_subscriptions_provider_subscription_id" ON "subscriptions" ("provider_subscription_id") WHERE "provider_subscription_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscriptions_user_id_status" ON "subscriptions" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscriptions_user_id_created_at" ON "subscriptions" ("user_id", "created_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "payment_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "subscription_id" uuid,
        "provider_order_id" varchar(128),
        "receipt" varchar(128),
        "amount" numeric(12,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'INR',
        "status" varchar(64) NOT NULL,
        "notes" jsonb,
        "raw_json" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_orders_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_orders_subscription_id" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_payment_orders_provider_order_id" ON "payment_orders" ("provider_order_id") WHERE "provider_order_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_orders_user_id" ON "payment_orders" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_orders_subscription_id" ON "payment_orders" ("subscription_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "subscription_id" uuid,
        "provider_payment_id" varchar(128) NOT NULL,
        "provider_order_id" varchar(128),
        "amount" numeric(12,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'INR',
        "status" varchar(64) NOT NULL,
        "method" varchar(64),
        "bank" varchar(128),
        "wallet" varchar(128),
        "upi" varchar(128),
        "fee" numeric(12,2),
        "tax" numeric(12,2),
        "captured_at" TIMESTAMPTZ,
        "invoice_id" varchar(128),
        "raw_json" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_subscription_id" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_payments_provider_payment_id" UNIQUE ("provider_payment_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_payments_user_id" ON "payments" ("user_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_subscription_id" ON "payments" ("subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_provider_order_id" ON "payments" ("provider_order_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payment_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" varchar(32) NOT NULL DEFAULT 'razorpay',
        "event_id" varchar(128) NOT NULL,
        "event_name" varchar(128) NOT NULL,
        "processed" boolean NOT NULL DEFAULT false,
        "signature" text,
        "payload" jsonb NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_events_provider_event_id" UNIQUE ("provider", "event_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_events_event_name" ON "payment_events" ("event_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_events_processed" ON "payment_events" ("processed")`,
    );

    await queryRunner.query(`
      CREATE TABLE "coupon_redemptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "coupon_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "subscription_id" uuid,
        "discount_amount" numeric(12,2) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupon_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coupon_redemptions_coupon_id" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_coupon_redemptions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_coupon_redemptions_subscription_id" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_coupon_redemptions_coupon_user" ON "coupon_redemptions" ("coupon_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coupon_redemptions_user_id" ON "coupon_redemptions" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refunds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payment_id" uuid NOT NULL,
        "provider_refund_id" varchar(128) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "status" varchar(64) NOT NULL,
        "reason" text,
        "raw_json" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refunds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refunds_payment_id" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_refunds_provider_refund_id" UNIQUE ("provider_refund_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_refunds_payment_id" ON "refunds" ("payment_id")`);

    // Seed example coupons (inactive until you activate in admin / DB)
    await queryRunner.query(`
      INSERT INTO "coupons" ("code", "type", "value", "minimum_amount", "maximum_discount", "expiry", "maximum_redemption", "used_count", "active", "once_per_user")
      VALUES
        ('WELCOME100', 'flat', 100, 599, 100, NULL, 1000, 0, true, true),
        ('FIRST50', 'percentage', 50, 599, 300, NULL, 500, 0, true, true),
        ('DIWALI20', 'percentage', 20, 599, 200, (NOW() + INTERVAL '180 days'), 2000, 0, true, true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refunds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_redemptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupons"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_coupon_type_enum"`);
  }
}
