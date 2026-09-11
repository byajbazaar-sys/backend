import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderIdToDepositTransactions1791100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deposit_transactions"
      ADD COLUMN "order_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "deposit_transactions"
      ADD CONSTRAINT "FK_deposit_transactions_order"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_deposit_transactions_order" ON "deposit_transactions" ("order_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_deposit_transactions_order"`);
    await queryRunner.query(`
      ALTER TABLE "deposit_transactions" DROP CONSTRAINT IF EXISTS "FK_deposit_transactions_order"
    `);
    await queryRunner.query(`
      ALTER TABLE "deposit_transactions" DROP COLUMN IF EXISTS "order_id"
    `);
  }
}
