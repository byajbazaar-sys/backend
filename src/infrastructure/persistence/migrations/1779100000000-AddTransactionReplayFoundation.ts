import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records the loan effect each transaction applied, plus a per-loan ordering
 * sequence and a loan baseline checkpoint. Schema only — data backfill lives in
 * Backend/backfill/backfill-transaction-replay-foundation.ts and must run before
 * loan_seq can be made NOT NULL.
 */
export class AddTransactionReplayFoundation1779100000000 implements MigrationInterface {
  name = 'AddTransactionReplayFoundation1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN IF NOT EXISTS "amount_remaining_delta"   numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "amount_paid_delta"        numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "interest_remaining_delta" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "interest_paid_delta"      numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "periods_at_creation"      int,
        ADD COLUMN IF NOT EXISTS "loan_seq"                 int
    `);

    await queryRunner.query(`
      ALTER TABLE "loans"
        ADD COLUMN IF NOT EXISTS "baseline_amount_remaining"   numeric(12,2),
        ADD COLUMN IF NOT EXISTS "baseline_amount_paid"        numeric(12,2),
        ADD COLUMN IF NOT EXISTS "baseline_interest_remaining" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "baseline_interest_paid"      numeric(12,2),
        ADD COLUMN IF NOT EXISTS "baseline_seq"                int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "txn_seq_counter"             int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "version"                     int NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_loan_seq"
        ON "transactions" ("loan_id", "loan_seq")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_transactions_loan_seq"`);

    await queryRunner.query(`
      ALTER TABLE "loans"
        DROP COLUMN IF EXISTS "baseline_amount_remaining",
        DROP COLUMN IF EXISTS "baseline_amount_paid",
        DROP COLUMN IF EXISTS "baseline_interest_remaining",
        DROP COLUMN IF EXISTS "baseline_interest_paid",
        DROP COLUMN IF EXISTS "baseline_seq",
        DROP COLUMN IF EXISTS "txn_seq_counter",
        DROP COLUMN IF EXISTS "version"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN IF EXISTS "amount_remaining_delta",
        DROP COLUMN IF EXISTS "amount_paid_delta",
        DROP COLUMN IF EXISTS "interest_remaining_delta",
        DROP COLUMN IF EXISTS "interest_paid_delta",
        DROP COLUMN IF EXISTS "periods_at_creation",
        DROP COLUMN IF EXISTS "loan_seq"
    `);
  }
}
