/**
 * Backfill for migration 1779100000000-AddTransactionReplayFoundation.
 *
 * Run once, after the migration, against each environment:
 *
 *   npm run backfill:replay-foundation -- --dry-run   # report only
 *   npm run backfill:replay-foundation                # apply
 *
 * What it does:
 *
 *  1. Renumbers transactions.loan_seq per loan, ordered by (created_at, id), and
 *     raises loans.txn_seq_counter to the highest number handed out.
 *
 *  2. Sets each loan's replay baseline to its CURRENT balances with
 *     baseline_seq = max(loan_seq).
 *
 * On (1): it renumbers rather than only filling in NULLs. Any transaction the
 * application recorded between the migration and this run already carries a seq
 * starting from 1, so numbering the legacy rows around it would reuse those
 * values and leave the newest row sorted below older ones. Rewriting is safe
 * because baseline_seq is the only thing that reads seq values, and the loans
 * being renumbered are exactly those whose baseline is unset or untrustworthy.
 *
 * On (2): existing transactions predate effect tracking, so their true effect on
 * the loan is not recoverable — a top-up's interest depended on the unpaid due
 * count at the time, which was never stored. Rather than guess, this freezes
 * existing history: the baseline says "these balances are the starting point,
 * nothing before this point is replayable". Loans become replayable as new
 * transactions accumulate. Deltas are deliberately left at 0 on old rows; the
 * service reads that as "no recorded effect" and falls back to the safe
 * per-type rules.
 *
 * Safe to re-run: only rows still missing values are touched.
 */
import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { generateDataSourceOptions } from '../src/infrastructure/persistence/type-orm.config';

const isDryRun = process.argv.includes('--dry-run');

/**
 * Loans whose numbering cannot be trusted: never backfilled, or numbered by an
 * earlier run while the application was still allocating sequences of its own,
 * which leaves two rows sharing a seq.
 */
const LOANS_NEEDING_RENUMBER = `
  SELECT "id" AS loan_id FROM "loans" WHERE "baseline_amount_remaining" IS NULL
  UNION
  SELECT "loan_id"
    FROM "transactions"
   WHERE "loan_seq" IS NOT NULL
   GROUP BY "loan_id", "loan_seq"
  HAVING COUNT(*) > 1
`;

interface PendingCounts {
  transactionsMissingSeq: number;
  loansMissingBaseline: number;
  duplicateSequences: number;
}

const readPendingCounts = async (db: DataSource | EntityManager): Promise<PendingCounts> => {
  const [{ count: transactionsMissingSeq }] = await db.query(
    `SELECT COUNT(*)::int AS count FROM "transactions" WHERE "loan_seq" IS NULL`,
  );
  const [{ count: loansMissingBaseline }] = await db.query(
    `SELECT COUNT(*)::int AS count FROM "loans" WHERE "baseline_amount_remaining" IS NULL`,
  );
  const [{ count: duplicateSequences }] = await db.query(`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1
        FROM "transactions"
       WHERE "loan_seq" IS NOT NULL
       GROUP BY "loan_id", "loan_seq"
      HAVING COUNT(*) > 1
    ) d
  `);
  return { transactionsMissingSeq, loansMissingBaseline, duplicateSequences };
};

/**
 * A baseline recorded against duplicated sequences points at an ambiguous
 * position in the history, so it is dropped and re-seeded from the renumbered
 * rows below.
 */
const clearUntrustedBaselines = async (manager: EntityManager): Promise<void> => {
  await manager.query(`
    UPDATE "loans"
       SET "baseline_amount_remaining"   = NULL,
           "baseline_amount_paid"        = NULL,
           "baseline_interest_remaining" = NULL,
           "baseline_interest_paid"      = NULL,
           "baseline_seq"                = 0
     WHERE "id" IN (
       SELECT "loan_id"
         FROM "transactions"
        WHERE "loan_seq" IS NOT NULL
        GROUP BY "loan_id", "loan_seq"
       HAVING COUNT(*) > 1
     )
  `);
};

const assignTransactionSequences = async (manager: EntityManager): Promise<number> => {
  const result = await manager.query(`
    WITH target_loans AS (${LOANS_NEEDING_RENUMBER}),
    ordered AS (
      SELECT t."id",
             ROW_NUMBER() OVER (
               PARTITION BY t."loan_id" ORDER BY t."created_at" ASC, t."id" ASC
             ) AS rn
        FROM "transactions" t
        JOIN target_loans l ON l."loan_id" = t."loan_id"
    )
    UPDATE "transactions" t
       SET "loan_seq" = o.rn
      FROM ordered o
     WHERE t."id" = o."id"
       AND t."loan_seq" IS DISTINCT FROM o.rn
    RETURNING t."id"
  `);
  // Postgres returns UPDATE ... RETURNING as [rows, affectedCount].
  const rows = Array.isArray(result?.[0]) ? result[0] : result;
  return Array.isArray(rows) ? rows.length : 0;
};

const syncSequenceCounters = async (manager: EntityManager): Promise<void> => {
  await manager.query(`
    UPDATE "loans" l
       SET "txn_seq_counter" = m.max_seq
      FROM (
        SELECT "loan_id", COALESCE(MAX("loan_seq"), 0) AS max_seq
          FROM "transactions"
         GROUP BY "loan_id"
      ) m
     WHERE l."id" = m."loan_id"
       AND l."txn_seq_counter" < m.max_seq
  `);
};

const seedLoanBaselines = async (manager: EntityManager): Promise<void> => {
  await manager.query(`
    UPDATE "loans" l
       SET "baseline_amount_remaining"   = l."amount_remaining",
           "baseline_amount_paid"        = l."amount_paid",
           "baseline_interest_remaining" = l."interest_remaining",
           "baseline_interest_paid"      = l."interest_paid",
           "baseline_seq"                = m.max_seq
      FROM (
        SELECT "loan_id", COALESCE(MAX("loan_seq"), 0) AS max_seq
          FROM "transactions"
         GROUP BY "loan_id"
      ) m
     WHERE l."id" = m."loan_id"
       AND l."baseline_amount_remaining" IS NULL
  `);

  // Loans that have never had a transaction start at sequence zero.
  await manager.query(`
    UPDATE "loans"
       SET "baseline_amount_remaining"   = "amount_remaining",
           "baseline_amount_paid"        = "amount_paid",
           "baseline_interest_remaining" = "interest_remaining",
           "baseline_interest_paid"      = "interest_paid",
           "baseline_seq"                = 0
     WHERE "baseline_amount_remaining" IS NULL
  `);
};

const run = async (): Promise<void> => {
  const dataSource = new DataSource({
    ...generateDataSourceOptions(),
    logging: false,
  });
  await dataSource.initialize();

  try {
    const before = await readPendingCounts(dataSource);
    console.log('Pending before backfill:', before);

    if (isDryRun) {
      console.log('Dry run — no changes written.');
      return;
    }

    if (
      before.transactionsMissingSeq === 0 &&
      before.loansMissingBaseline === 0 &&
      before.duplicateSequences === 0
    ) {
      console.log('Nothing to backfill.');
      return;
    }

    await dataSource.transaction(async (manager) => {
      // Must precede renumbering, which is what makes the duplicates disappear.
      await clearUntrustedBaselines(manager);

      const sequenced = await assignTransactionSequences(manager);
      console.log(`Assigned loan_seq to ${sequenced} transaction(s).`);

      await syncSequenceCounters(manager);
      console.log('Synced loans.txn_seq_counter.');

      await seedLoanBaselines(manager);
      console.log('Seeded loan replay baselines.');
    });

    const after = await readPendingCounts(dataSource);
    console.log('Pending after backfill:', after);

    if (
      after.transactionsMissingSeq > 0 ||
      after.loansMissingBaseline > 0 ||
      after.duplicateSequences > 0
    ) {
      throw new Error('Backfill finished with rows still pending; investigate before proceeding.');
    }

    console.log('Backfill complete.');
  } finally {
    await dataSource.destroy();
  }
};

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
