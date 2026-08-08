import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes two transactions sharing a position on the same loan impossible at the
 * storage layer. allocateTransactionSeq already hands out numbers atomically, so
 * this guards against sequences the application did not issue — chiefly a
 * backfill run while the app was still accepting writes.
 *
 * Run after Backend/backfill/backfill-transaction-replay-foundation.ts.
 * Un-sequenced legacy rows are fine, since Postgres treats NULLs as distinct in
 * a unique index; duplicates stop the migration instead of being indexed.
 */
export class AddTransactionLoanSeqUniqueIndex1779200000000 implements MigrationInterface {
  name = 'AddTransactionLoanSeqUniqueIndex1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{ loan_id: string; loan_seq: number }> = await queryRunner.query(`
      SELECT "loan_id", "loan_seq"
        FROM "transactions"
       WHERE "loan_seq" IS NOT NULL
       GROUP BY "loan_id", "loan_seq"
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length) {
      const [first] = duplicates;
      throw new Error(
        `Cannot add unique index: ${duplicates.length} (loan_id, loan_seq) pair(s) are duplicated, ` +
          `first at loan ${first.loan_id} seq ${first.loan_seq}. ` +
          `Run "npm run backfill:replay-foundation" to renumber them, then migrate again.`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_transactions_loan_seq"
        ON "transactions" ("loan_id", "loan_seq")
    `);

    // Serves the same lookups as the unique index, so it is now redundant.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_transactions_loan_seq"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_loan_seq"
        ON "transactions" ("loan_id", "loan_seq")
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_transactions_loan_seq"`);
  }
}
