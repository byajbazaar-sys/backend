/**
 * Temporary verification harness for intermediate transaction corrections.
 * Boots the real application context so it exercises the same services the API
 * uses, then asserts that a correction either leaves the loan provably
 * consistent or leaves it completely untouched.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TRANSACTION_SERVICE, ITransactionService } from '../src/application/features/transactions/service';
import { LoanReplayService } from '../src/application/features/transactions/service/loan-replay.service';
import { LOAN_SERVICE, ILoanService } from '../src/application/features/loans';
import { DUES_REPOSITORY, IDuesRepository, TRANSACTIONS_REPOSITORY, ITransactionsRepository } from '../src/application/shared';
import { LOANS_REPOSITORY, ILoansRepository } from '../src/application/features/loans';
import { ETransactionType, ETransactionPaidIn } from '../src/application/features/transactions/enums';
import { EDueType } from '../src/application/shared';
import { Transaction } from '../src/application/features/transactions/domain';
import { Loan } from '../src/application/features/loans/domain';

const UNPAID = [EDueType.UPCOMING_DUE, EDueType.PAST_DUE, EDueType.OVERDUE];

let passed = 0;
let failed = 0;
const createdLoanIds: string[] = [];

const check = (name: string, condition: boolean, detail?: unknown): void => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

const round = (v: number): number => Math.round(Number(v) * 100) / 100;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ds = app.get(DataSource);
  const txService = app.get<ITransactionService>(TRANSACTION_SERVICE);
  const loanService = app.get<ILoanService>(LOAN_SERVICE);
  const replay = app.get(LoanReplayService);
  const duesRepo = app.get<IDuesRepository>(DUES_REPOSITORY);
  const loansRepo = app.get<ILoansRepository>(LOANS_REPOSITORY);
  const txRepo = app.get<ITransactionsRepository>(TRANSACTIONS_REPOSITORY);

  const [owner] = await ds.query(
    `SELECT c.id AS customer_id, c.created_by AS user_id
       FROM customers c
      ORDER BY c.created_at DESC
      LIMIT 1`,
  );
  if (!owner) throw new Error('No customer in dev DB to attach a test loan to');
  const { customer_id: customerId, user_id: userId } = owner;
  console.log(`Using customer ${customerId} (user ${userId})\n`);

  const makeLoan = async (principal: number, months: number, pct: number): Promise<Loan> => {
    const loan = await loanService.create({
      customerId,
      createdBy: userId,
      tenureType: 'Months',
      tenureValue: months,
      interestCalculationMethod: 'Simple',
      interestPercentage: pct,
      interestType: 'Monthly',
      amountRemaining: principal,
      amountPaid: 0,
      interestPaid: 0,
      status: 'Open',
      loanItems: [],
    } as unknown as Loan);
    createdLoanIds.push(loan.id);
    return loan;
  };

  const record = async (
    loanId: string,
    type: ETransactionType,
    amount: number,
    dueId?: string,
  ): Promise<Transaction> =>
    txService.create({
      loanId,
      amount,
      transactionType: type,
      paidIn: ETransactionPaidIn.CASH,
      createdBy: userId,
      dueId,
    } as unknown as Transaction);

  const nextDue = async (loanId: string) => {
    const dues = await duesRepo.findByLoanIdAndType(loanId, UNPAID);
    return dues[0];
  };

  const snapshot = async (loanId: string) => {
    const loan = await loansRepo.findById(loanId, userId);
    const dues = await duesRepo.findByLoanId(loanId);
    const txs = await txRepo.findAllByLoanIdOrdered(loanId, userId);
    return {
      balances: {
        amountRemaining: round(loan.amountRemaining),
        amountPaid: round(loan.amountPaid),
        interestRemaining: round(loan.interestRemaining),
        interestPaid: round(loan.interestPaid),
      },
      dues: dues
        .map((d) => `${new Date(d.dueDate).toISOString().slice(0, 10)}|${d.type === EDueType.PAID ? 'PAID' : 'UNPAID'}|${round(d.principalAmount)}|${round(d.interestAmount)}`)
        .sort(),
      txs: txs.map((t) => `${t.loanSeq}|${t.transactionType}|${round(t.amount)}`).sort(),
    };
  };

  /** The core guarantee: stored state must equal a replay of the recorded history. */
  const assertSelfConsistent = async (loanId: string, label: string): Promise<void> => {
    const before = await snapshot(loanId);
    try {
      await replay.replay(loanId, userId, { kind: 'none' });
      const after = await snapshot(loanId);
      check(
        `${label}: stored state equals a replay of its history`,
        JSON.stringify(before) === JSON.stringify(after),
        { before, after },
      );
    } catch (err) {
      check(`${label}: replay verification succeeded`, false, (err as Error).message);
    }
  };

  // ---------------------------------------------------------------- scenario 1
  console.log('Scenario 1: delete a top-up that sits in the middle of history');
  {
    const loan = await makeLoan(100000, 10, 2);
    const d1 = await nextDue(loan.id);
    const t1 = await record(loan.id, ETransactionType.DUE_PAYMENT, Number(d1.dueAmount), d1.id);
    const t2 = await record(loan.id, ETransactionType.TOP_UP, 20000);
    const d2 = await nextDue(loan.id);
    const t3 = await record(loan.id, ETransactionType.DUE_PAYMENT, Number(d2.dueAmount), d2.id);
    const t4 = await record(loan.id, ETransactionType.PRINCIPAL, 5000);

    await assertSelfConsistent(loan.id, 'before correction');
    const before = await snapshot(loan.id);

    let rejection: string | undefined;
    try {
      await txService.delete(t2.id, userId);
    } catch (err) {
      rejection = (err as Error).message;
    }

    if (rejection) {
      const after = await snapshot(loan.id);
      console.log(`  (refused) ${rejection}`);
      check('rejected correction left the loan byte-identical', JSON.stringify(before) === JSON.stringify(after), { before, after });
    } else {
      const txs = await txRepo.findAllByLoanIdOrdered(loan.id, userId);
      check('deleted transaction is gone', !txs.some((t) => t.id === t2.id));
      check('surviving transactions kept', [t1.id, t3.id, t4.id].every((id) => txs.some((t) => t.id === id)));
      await assertSelfConsistent(loan.id, 'after intermediate delete');

      const dues = await duesRepo.findByLoanId(loan.id);
      const paid = dues.filter((d) => d.type === EDueType.PAID);
      const loanNow = await loansRepo.findById(loan.id, userId);
      const paidPrincipal = round(paid.reduce((s, d) => s + Number(d.principalAmount), 0));
      const principalFromPayments = round(
        (await txRepo.findAllByLoanIdOrdered(loan.id, userId))
          .filter((t) => t.transactionType === ETransactionType.PRINCIPAL)
          .reduce((s, t) => s + Number(t.amount), 0),
      );
      check(
        'loan amountPaid equals paid dues principal plus principal payments',
        round(loanNow.amountPaid) === round(paidPrincipal + principalFromPayments),
        { amountPaid: round(loanNow.amountPaid), paidPrincipal, principalFromPayments },
      );
      check('no due left dangling as paid-with-balance', paid.every((d) => round(d.dueAmount) === 0));
    }
  }

  // ---------------------------------------------------------------- scenario 2
  console.log('\nScenario 2: edit the amount of an earlier principal payment');
  {
    const loan = await makeLoan(60000, 6, 2);
    const t1 = await record(loan.id, ETransactionType.PRINCIPAL, 5000);
    const t2 = await record(loan.id, ETransactionType.INTEREST, 1000);
    await record(loan.id, ETransactionType.PRINCIPAL, 3000);

    await assertSelfConsistent(loan.id, 'before edit');
    const beforeLoan = await loansRepo.findById(loan.id, userId);

    let rejection: string | undefined;
    try {
      await txService.update(t1.id, { amount: 9000 } as never, userId);
    } catch (err) {
      rejection = (err as Error).message;
    }

    if (rejection) {
      console.log(`  (refused) ${rejection}`);
      check('edit of earlier transaction was not silently dropped', false, rejection);
    } else {
      const updated = await txRepo.findById(t1.id, userId);
      check('edited amount persisted', round(updated.amount) === 9000, round(updated.amount));
      const afterLoan = await loansRepo.findById(loan.id, userId);
      check(
        'principal outstanding dropped by the extra 4000',
        round(afterLoan.amountRemaining) === round(Number(beforeLoan.amountRemaining) - 4000),
        { before: round(beforeLoan.amountRemaining), after: round(afterLoan.amountRemaining) },
      );
      check('later interest payment untouched', !!(await txRepo.findById(t2.id, userId)));
      await assertSelfConsistent(loan.id, 'after intermediate amount edit');
    }
  }

  // ---------------------------------------------------------------- scenario 3
  console.log('\nScenario 3: correction that would invalidate a later payment must be refused');
  {
    const loan = await makeLoan(10000, 6, 1);
    const topUp = await record(loan.id, ETransactionType.TOP_UP, 50000);
    await record(loan.id, ETransactionType.PRINCIPAL, 55000);

    await assertSelfConsistent(loan.id, 'before impossible edit');
    const before = await snapshot(loan.id);

    let rejection: string | undefined;
    try {
      await txService.update(topUp.id, { amount: 1000 } as never, userId);
    } catch (err) {
      rejection = (err as Error).message;
    }

    check('impossible correction was refused', !!rejection, rejection);
    if (rejection) {
      console.log(`  (refused) ${rejection}`);
      check('refusal names the blocking transaction', /principal payment|interest payment/i.test(rejection), rejection);
      check('refusal tells user to fix the blocking payment first', /delete or adjust/i.test(rejection), rejection);
    }
    const after = await snapshot(loan.id);
    check('refused correction left the loan byte-identical', JSON.stringify(before) === JSON.stringify(after), { before, after });
    await assertSelfConsistent(loan.id, 'after refused edit');
  }

  // ---------------------------------------------------------------- scenario 4
  console.log('\nScenario 4: deleting an earlier due payment restores that due');
  {
    const loan = await makeLoan(80000, 8, 2);
    const d1 = await nextDue(loan.id);
    const t1 = await record(loan.id, ETransactionType.DUE_PAYMENT, Number(d1.dueAmount), d1.id);
    const d2 = await nextDue(loan.id);
    await record(loan.id, ETransactionType.DUE_PAYMENT, Number(d2.dueAmount), d2.id);

    await assertSelfConsistent(loan.id, 'before due-payment delete');
    const before = await snapshot(loan.id);

    let rejection: string | undefined;
    try {
      await txService.delete(t1.id, userId);
    } catch (err) {
      rejection = (err as Error).message;
    }

    if (rejection) {
      console.log(`  (refused) ${rejection}`);
      const after = await snapshot(loan.id);
      check('refused due-payment delete left the loan byte-identical', JSON.stringify(before) === JSON.stringify(after));
    } else {
      const dues = await duesRepo.findByLoanId(loan.id);
      const paidCount = dues.filter((d) => d.type === EDueType.PAID).length;
      check('exactly one due remains paid', paidCount === 1, paidCount);
      await assertSelfConsistent(loan.id, 'after due-payment delete');
    }
  }

  // ---------------------------------------------------------------- scenario 5
  console.log('\nScenario 5: delete from the middle of a longer chain');
  {
    const loan = await makeLoan(50000, 10, 1);
    await record(loan.id, ETransactionType.PRINCIPAL, 4000);
    await record(loan.id, ETransactionType.INTEREST, 1500);
    const target = await record(loan.id, ETransactionType.PRINCIPAL, 6000);
    await record(loan.id, ETransactionType.INTEREST, 800);
    await record(loan.id, ETransactionType.PRINCIPAL, 2000);

    await assertSelfConsistent(loan.id, 'before chain delete');
    const beforeLoan = await loansRepo.findById(loan.id, userId);

    const started = Date.now();
    await txService.delete(target.id, userId);
    const elapsed = Date.now() - started;

    const afterLoan = await loansRepo.findById(loan.id, userId);
    check(
      'principal outstanding rose by exactly the deleted 6000',
      round(afterLoan.amountRemaining) === round(Number(beforeLoan.amountRemaining) + 6000),
      { before: round(beforeLoan.amountRemaining), after: round(afterLoan.amountRemaining) },
    );
    check(
      'principal paid fell by exactly the deleted 6000',
      round(afterLoan.amountPaid) === round(Number(beforeLoan.amountPaid) - 6000),
      { before: round(beforeLoan.amountPaid), after: round(afterLoan.amountPaid) },
    );
    check(
      'interest totals untouched by a principal correction',
      round(afterLoan.interestPaid) === round(Number(beforeLoan.interestPaid)),
    );
    const remaining = await txRepo.findAllByLoanIdOrdered(loan.id, userId);
    check('four transactions remain', remaining.length === 4, remaining.length);
    check('sequence order still strictly increasing', remaining.every((t, i) => i === 0 || t.loanSeq > remaining[i - 1].loanSeq));
    await assertSelfConsistent(loan.id, 'after chain delete');
    console.log(`  (replay of 5-transaction history took ${elapsed}ms)`);
  }

  // ---------------------------------------------------------------- scenario 6
  console.log('\nScenario 6: stale version and concurrent corrections');
  {
    const loan = await makeLoan(40000, 8, 1);
    const t1 = await record(loan.id, ETransactionType.PRINCIPAL, 3000);
    await record(loan.id, ETransactionType.INTEREST, 500);
    await record(loan.id, ETransactionType.PRINCIPAL, 1000);

    let staleError: { status?: number; message?: string } | undefined;
    try {
      await txService.update(t1.id, { amount: 3500, expectedLoanVersion: 0 } as never, userId);
    } catch (err) {
      staleError = err as { status?: number; message?: string };
    }
    check('stale loan version is rejected with a conflict', staleError?.status === 409, {
      status: staleError?.status,
      message: staleError?.message,
    });

    const before = await snapshot(loan.id);
    const current = await loansRepo.findById(loan.id, userId);
    const results = await Promise.allSettled([
      txService.update(t1.id, { amount: 3600, expectedLoanVersion: current.version } as never, userId),
      txService.update(t1.id, { amount: 3700, expectedLoanVersion: current.version } as never, userId),
    ]);
    const wins = results.filter((r) => r.status === 'fulfilled').length;
    check('exactly one of two racing corrections is applied', wins === 1, results.map((r) => r.status));

    const finalTx = await txRepo.findById(t1.id, userId);
    check('winning amount is one of the two attempted', [3600, 3700].includes(round(finalTx.amount)), round(finalTx.amount));
    check('losing correction did not also land', JSON.stringify(before) !== JSON.stringify(await snapshot(loan.id)));
    await assertSelfConsistent(loan.id, 'after racing corrections');
  }

  // ---------------------------------------------------------------- scenario 7
  console.log('\nScenario 7: frozen history is refused rather than rewritten');
  {
    const loan = await makeLoan(30000, 6, 1);
    const t1 = await record(loan.id, ETransactionType.PRINCIPAL, 2000);
    await record(loan.id, ETransactionType.PRINCIPAL, 1000);

    // Simulate a loan whose checkpoint sits past this transaction, which is what
    // the backfill leaves behind for history recorded before replay existed.
    await ds.query(`UPDATE loans SET baseline_seq = 99 WHERE id = $1`, [loan.id]);
    const before = await snapshot(loan.id);

    let rejection: string | undefined;
    try {
      await txService.delete(t1.id, userId);
    } catch (err) {
      rejection = (err as Error).message;
    }
    check('frozen transaction cannot be deleted', !!rejection && /frozen history/.test(rejection), rejection);
    check('frozen refusal left the loan byte-identical', JSON.stringify(before) === JSON.stringify(await snapshot(loan.id)));
    await ds.query(`UPDATE loans SET baseline_seq = 0 WHERE id = $1`, [loan.id]);
  }

  // ---------------------------------------------------------------- scenario 8
  console.log('\nScenario 8: cost of correcting a long history');
  {
    const loan = await makeLoan(200000, 24, 1);
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const tx = await record(
        loan.id,
        i % 2 === 0 ? ETransactionType.PRINCIPAL : ETransactionType.INTEREST,
        i % 2 === 0 ? 2000 : 500,
      );
      ids.push(tx.id);
    }
    const beforeLoan = await loansRepo.findById(loan.id, userId);
    const started = Date.now();
    await txService.delete(ids[3], userId);
    const elapsed = Date.now() - started;

    const afterLoan = await loansRepo.findById(loan.id, userId);
    check(
      'deleting one interest payment of 500 from 12 restores exactly 500',
      round(afterLoan.interestPaid) === round(Number(beforeLoan.interestPaid) - 500),
      { before: round(beforeLoan.interestPaid), after: round(afterLoan.interestPaid) },
    );
    await assertSelfConsistent(loan.id, 'after long-history delete');
    console.log(`  (correcting a 12-transaction history took ${elapsed}ms against remote RDS)`);
  }

  // cleanup
  console.log('\nCleaning up test loans');
  for (const loanId of createdLoanIds) {
    try {
      await loanService.delete(loanId, userId);
    } catch (err) {
      console.log(`  could not delete loan ${loanId}: ${(err as Error).message}`);
    }
  }
  const leftover = await ds.query(`SELECT COUNT(*)::int AS c FROM loans WHERE id = ANY($1)`, [createdLoanIds]);
  check('all test loans removed', leftover[0].c === 0, leftover[0]);

  console.log(`\n${passed} passed, ${failed} failed`);
  await app.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('harness crashed', err);
  process.exit(1);
});
