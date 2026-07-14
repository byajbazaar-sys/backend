import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentEventLinks1778100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_events" ADD "user_id" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "payment_events" ADD "payment_id" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "payment_events" ADD "payment_order_id" uuid NULL`);

    await queryRunner.query(`
      ALTER TABLE "payment_events"
      ADD CONSTRAINT "FK_payment_events_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_events"
      ADD CONSTRAINT "FK_payment_events_payment_id"
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_events"
      ADD CONSTRAINT "FK_payment_events_payment_order_id"
      FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_events_user_id" ON "payment_events" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_events_payment_id" ON "payment_events" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_events_payment_order_id" ON "payment_events" ("payment_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_events_payment_order_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_events_payment_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_events_user_id"`);
    await queryRunner.query(
      `ALTER TABLE "payment_events" DROP CONSTRAINT IF EXISTS "FK_payment_events_payment_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_events" DROP CONSTRAINT IF EXISTS "FK_payment_events_payment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_events" DROP CONSTRAINT IF EXISTS "FK_payment_events_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "payment_events" DROP COLUMN "payment_order_id"`);
    await queryRunner.query(`ALTER TABLE "payment_events" DROP COLUMN "payment_id"`);
    await queryRunner.query(`ALTER TABLE "payment_events" DROP COLUMN "user_id"`);
  }
}
