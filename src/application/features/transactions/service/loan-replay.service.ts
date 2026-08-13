import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { emptyLoanEffect, LoanEffect, Transaction } from '../domain';
import { ETransactionType } from '../enums';
import {
  LOANS_REPOSITORY,
  ILoansRepository,
  ELoanStatus,
  Loan,
  ILoanService,
  LOAN_SERVICE,
  EInterestCalculationMethod,
} from '../../loans';
import {
  DUES_REPOSITORY,
  EDueType,
  IDuesRepository,
  Due,
  ITransactionsRepository,
  TRANSACTIONS_REPOSITORY,
  IUnitOfWork,
  UNIT_OF_WORK,
} from '../../../shared';

/** How a replay should differ from the history currently on record. */
export type ReplayMutation =
  | { kind: 'none' }
  | { kind: 'delete'; transactionId: string }
  | { kind: 'editAmount'; transactionId: string; newAmount: number };

/**
 * Loan state reduced to the parts a replay is responsible for reproducing.
 * Due `type` is deliberately excluded: it is a function of today's date and is
 * rewritten by the past-due cron, so it says nothing about replay fidelity.
 */
interface LoanStateSignature {
  amountRemaining: number;
  amountPaid: number;
  interestRemaining: number;
  interestPaid: number;
  paidDues: string[];
  unpaidDues: string[];
}

interface AppliedEffect {
  transactionId: string;
  effect: LoanEffect;
  periodsAtCreation?: number;
  dueId?: string;
}

const UNPAID_DUE_TYPES = [EDueType.UPCOMING_DUE, EDueType.PAST_DUE, EDueType.OVERDUE];

/**
 * Rebuilds a loan from its replay checkpoint by re-applying every transaction
 * recorded after it, in order.
 *
 * This exists because correcting a transaction in the middle of a loan's history
 * cannot be done by subtracting that one transaction's effect from today's
 * balances: every transaction after it was applied to the state the corrected
 * one produced, and the due schedule was rebuilt along the way. Undoing one and
 * leaving the rest in place mixes two different histories into one loan.
 *
 * Safety here rests on one property rather than on careful arithmetic: the
 * caller first replays the history *unchanged* and requires the result to match
 * what is already stored (see `assertReplayReproducesCurrentState`). A loan that
 * fails that check is refused rather than rewritten, so the engine is only ever
 * trusted to produce new state after it has proved it can reproduce the old.
 */
@Injectable()
export class LoanReplayService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactionsRepo: ITransactionsRepository,
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    @Inject(LOAN_SERVICE) private readonly loanService: ILoanService,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @InjectPinoLogger(LoanReplayService.name) private readonly logger: PinoLogger,
  ) { }

  /**
   * Joins the caller's transaction when there is one, and opens its own when
   * there is not. Rewinding to the checkpoint is destructive by nature, so a
   * replay that runs unprotected could leave a half-rebuilt loan behind; on any
   * failure the surrounding transaction restores exactly the prior state.
   */
  async replay(loanId: string, createdBy: string, mutation: ReplayMutation): Promise<void> {
    return this.unitOfWork.runInTransaction(() =>
      this.replayWithinTransaction(loanId, createdBy, mutation),
    );
  }

  private async replayWithinTransaction(
    loanId: string,
    createdBy: string,
    mutation: ReplayMutation,
  ): Promise<void> {
    const loan = await this.loadReplayableLoan(loanId, createdBy);
    const history = await this.transactionsRepo.findAllByLoanIdOrdered(loanId, createdBy);
    const baselineSeq = Number(loan.baselineSeq ?? 0);

    const frozen = history.filter((t) => this.isFrozen(t, baselineSeq));
    const replayable = history.filter((t) => !this.isFrozen(t, baselineSeq));

    this.assertMutationTargetIsReplayable(mutation, replayable, frozen);
    this.assertHistoryIsReplaySafe(replayable);

    // Read before anything is touched: the schedule rebuild below replaces due
    // rows, and a due payment can then only be matched by its date.
    const dueDatesByTransaction = await this.captureDueDates(replayable, createdBy);
    const before = await this.captureSignature(loan, createdBy);

    const verified = await this.assertReplayReproducesCurrentState(
      loan,
      frozen,
      replayable,
      dueDatesByTransaction,
      before,
      createdBy,
    );

    if (mutation.kind === 'none') {
      // The rebuilt state is provably identical, but the schedule it was rebuilt
      // from is made of new rows, so the due payments still have to be pointed at
      // the dues this pass marked paid.
      await this.persistAppliedEffects(verified, createdBy);
      return;
    }

    const plan = this.buildPlan(replayable, mutation);
    const applied = await this.runReplay(loan, frozen, plan, dueDatesByTransaction, createdBy);

    await this.persistAppliedEffects(applied, createdBy);

    if (mutation.kind === 'delete') {
      await this.transactionsRepo.delete(mutation.transactionId);
    }
    if (mutation.kind === 'editAmount') {
      await this.transactionsRepo.applyReplayResult(mutation.transactionId, createdBy, {
        amount: mutation.newAmount,
        effect: this.findEffect(applied, mutation.transactionId),
      });
    }

    this.logger.info(
      { loanId, mutation: mutation.kind, replayedCount: plan.length },
      'Loan history replayed after transaction correction',
    );
  }

  private async loadReplayableLoan(loanId: string, createdBy: string): Promise<Loan> {
    const loan = await this.loansRepo.findById(loanId, createdBy);
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    if (loan.status === ELoanStatus.CLOSED) {
      throw new BadRequestException('Cannot modify transactions on a closed loan');
    }
    if (loan.baselineAmountRemaining == null || loan.baselineInterestRemaining == null) {
      throw new BadRequestException(
        'This loan has no replay checkpoint yet, so earlier transactions cannot be corrected. Only the latest transaction can be changed.',
      );
    }
    return loan;
  }

  private isFrozen(transaction: Transaction, baselineSeq: number): boolean {
    const seq = transaction.loanSeq;
    return seq == null || Number(seq) <= baselineSeq;
  }

  private assertMutationTargetIsReplayable(
    mutation: ReplayMutation,
    replayable: Transaction[],
    frozen: Transaction[],
  ): void {
    if (mutation.kind === 'none') return;
    if (replayable.some((t) => t.id === mutation.transactionId)) return;

    if (frozen.some((t) => t.id === mutation.transactionId)) {
      throw new BadRequestException(
        'This transaction is part of frozen history that predates loan replay and cannot be corrected automatically. Please adjust the loan manually.',
      );
    }
    throw new NotFoundException('Transaction not found');
  }

  /**
   * Replay recomputes each effect from scratch, so stored deltas are not needed.
   * Two inputs are not recoverable from the loan, though, and a row missing
   * either of them cannot be replayed truthfully.
   */
  private assertHistoryIsReplaySafe(replayable: Transaction[]): void {
    for (const transaction of replayable) {
      if (transaction.transactionType === ETransactionType.TOP_UP && transaction.periodsAtCreation == null) {
        throw new BadRequestException(
          'A top-up in this loan does not record the tenure its interest was priced against, so the history cannot be replayed. Please adjust the loan manually.',
        );
      }
      if (transaction.transactionType === ETransactionType.DUE_PAYMENT && !transaction.dueId) {
        throw new BadRequestException(
          'A due payment in this loan is missing its due reference, so the history cannot be replayed. Please adjust the loan manually.',
        );
      }
    }
  }

  private async captureDueDates(
    replayable: Transaction[],
    createdBy: string,
  ): Promise<Map<string, number>> {
    const dueDates = new Map<string, number>();
    for (const transaction of replayable) {
      if (transaction.transactionType !== ETransactionType.DUE_PAYMENT) continue;
      const due = await this.duesRepo.findById(transaction.dueId, createdBy);
      if (!due) {
        throw new BadRequestException(
          'A due payment in this loan points at a due that no longer exists, so the history cannot be replayed. Please adjust the loan manually.',
        );
      }
      dueDates.set(transaction.id, this.startOfDay(due.dueDate));
    }
    return dueDates;
  }

  /**
   * The safety gate. Rewinds to the checkpoint, replays the recorded history
   * exactly as it stands, and requires the outcome to equal what is stored. A
   * mismatch means this engine does not model the loan faithfully, so it must
   * not be trusted to rewrite it.
   */
  private async assertReplayReproducesCurrentState(
    loan: Loan,
    frozen: Transaction[],
    replayable: Transaction[],
    dueDatesByTransaction: Map<string, number>,
    before: LoanStateSignature,
    createdBy: string,
  ): Promise<AppliedEffect[]> {
    const plan = replayable.map((transaction) => ({ transaction, amount: Number(transaction.amount) }));

    let applied: AppliedEffect[];
    try {
      applied = await this.runReplay(loan, frozen, plan, dueDatesByTransaction, createdBy);
    } catch (err) {
      throw new BadRequestException(
        `This loan's history cannot be replayed, so earlier transactions cannot be corrected safely (${this.describe(err)}).`,
      );
    }

    const reproduced = await this.captureSignature(loan, createdBy);
    if (!this.signaturesMatch(before, reproduced)) {
      this.logger.error({ loanId: loan.id, before, reproduced }, 'Replay did not reproduce stored loan state');
      throw new BadRequestException(
        "This loan's stored balances do not match a replay of its transactions, so correcting an earlier transaction is not safe. Only the latest transaction can be changed.",
      );
    }
    return applied;
  }

  private buildPlan(
    replayable: Transaction[],
    mutation: ReplayMutation,
  ): Array<{ transaction: Transaction; amount: number }> {
    const plan: Array<{ transaction: Transaction; amount: number }> = [];
    for (const transaction of replayable) {
      if (mutation.kind === 'delete' && transaction.id === mutation.transactionId) {
        continue;
      }
      const amount =
        mutation.kind === 'editAmount' && transaction.id === mutation.transactionId
          ? mutation.newAmount
          : Number(transaction.amount);
      plan.push({ transaction, amount });
    }
    return plan;
  }

  /**
   * Rewinds the loan to its checkpoint and re-applies the plan in order. Each
   * step runs the same rules as recording a new transaction, so a step that
   * would not have been allowed at the time fails the whole replay.
   */
  private async runReplay(
    loan: Loan,
    frozen: Transaction[],
    plan: Array<{ transaction: Transaction; amount: number }>,
    dueDatesByTransaction: Map<string, number>,
    createdBy: string,
  ): Promise<AppliedEffect[]> {
    await this.rewindToBaseline(loan, frozen, createdBy);

    const applied: AppliedEffect[] = [];
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      const result = await this.applyOne(
        step.transaction,
        step.amount,
        dueDatesByTransaction,
        createdBy,
        this.needsScheduleRebuild(plan, i),
      );
      applied.push({ transactionId: step.transaction.id, ...result });
    }
    return applied;
  }

  /**
   * Rebuilding the schedule is the expensive part of a replay, and a rebuild is
   * only observable to a due payment (which consumes a scheduled due) or to the
   * final state. Consecutive balance changes can therefore share one rebuild:
   * they read the loan's totals, and a top-up prices its interest from the
   * tenure stored on the row rather than from the current schedule.
   *
   * The verification pass is what makes this safe to assert — collapsing
   * rebuilds that did matter would change the outcome and be caught there.
   */
  private needsScheduleRebuild(
    plan: Array<{ transaction: Transaction; amount: number }>,
    index: number,
  ): boolean {
    const type = plan[index].transaction.transactionType;
    const affectsSchedule =
      type === ETransactionType.INTEREST ||
      type === ETransactionType.PRINCIPAL ||
      type === ETransactionType.TOP_UP;
    if (!affectsSchedule) return false;

    const next = plan[index + 1];
    return !next || next.transaction.transactionType === ETransactionType.DUE_PAYMENT;
  }

  private async rewindToBaseline(loan: Loan, frozen: Transaction[], createdBy: string): Promise<void> {
    const frozenPaidDueIds = frozen
      .filter((t) => t.transactionType === ETransactionType.DUE_PAYMENT && t.dueId)
      .map((t) => t.dueId);

    // Everything the replayable history touched goes, including dues it marked
    // paid; dues belonging to frozen history stay exactly as they are.
    await this.duesRepo.deleteByLoanIdExcept(loan.id, frozenPaidDueIds);

    const atBaseline: Loan = {
      ...loan,
      amountRemaining: this.round(Number(loan.baselineAmountRemaining ?? 0)),
      amountPaid: this.round(Number(loan.baselineAmountPaid ?? 0)),
      interestRemaining: this.round(Number(loan.baselineInterestRemaining ?? 0)),
      interestPaid: this.round(Number(loan.baselineInterestPaid ?? 0)),
    };
    await this.saveBalances(loan.id, atBaseline);
    await this.loanService.recalculateDuesForLoan(loan.id, createdBy);
  }

  /**
   * Mirrors the effects a transaction has when it is first recorded, so replay
   * and create can never drift apart in what a transaction means.
   */
  private async applyOne(
    transaction: Transaction,
    amount: number,
    dueDatesByTransaction: Map<string, number>,
    createdBy: string,
    rebuildSchedule: boolean,
  ): Promise<{ effect: LoanEffect; periodsAtCreation?: number; dueId?: string }> {
    const loanId = transaction.loanId;
    const loan = await this.loansRepo.findById(loanId, createdBy);
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    const effect = emptyLoanEffect();
    let periodsAtCreation: number;
    let dueId: string;

    switch (transaction.transactionType) {
      case ETransactionType.INTEREST: {
        if (Number(loan.interestRemaining) < amount) {
          throw new BadRequestException(
            this.blockedBy(transaction, `interest payment of ${amount} exceeds the ${loan.interestRemaining} interest outstanding at that point`),
          );
        }
        loan.interestRemaining = this.round(Number(loan.interestRemaining) - amount);
        loan.interestPaid = this.round(Number(loan.interestPaid) + amount);
        effect.interestRemainingDelta = -amount;
        effect.interestPaidDelta = amount;
        break;
      }
      case ETransactionType.PRINCIPAL: {
        if (Number(loan.amountRemaining) < amount) {
          throw new BadRequestException(
            this.blockedBy(transaction, `principal payment of ${amount} exceeds the ${loan.amountRemaining} principal outstanding at that point`),
          );
        }
        loan.amountRemaining = this.round(Number(loan.amountRemaining) - amount);
        loan.amountPaid = this.round(Number(loan.amountPaid) + amount);
        effect.amountRemainingDelta = -amount;
        effect.amountPaidDelta = amount;
        break;
      }
      case ETransactionType.TOP_UP: {
        if (!(amount > 0)) {
          throw new BadRequestException('Top up amount must be greater than zero');
        }
        loan.amountRemaining = this.round(Number(loan.amountRemaining) + amount);
        effect.amountRemainingDelta = amount;
        // The tenure a top-up was priced against is a property of the moment it
        // was recorded, so it is carried, never recomputed from today's schedule.
        periodsAtCreation = Number(transaction.periodsAtCreation);
        if (periodsAtCreation > 0) {
          const interestAdded = this.topUpInterest(loan, amount, periodsAtCreation);
          loan.interestRemaining = this.round(Number(loan.interestRemaining) + interestAdded);
          effect.interestRemainingDelta = interestAdded;
        }
        break;
      }
      case ETransactionType.DUE_PAYMENT: {
        const due = await this.findUnpaidDueOnDate(loanId, dueDatesByTransaction.get(transaction.id), transaction);
        if (this.round(Number(due.dueAmount)) !== this.round(amount)) {
          throw new BadRequestException(
            this.blockedBy(transaction, `it paid ${amount} against a due that is ${due.dueAmount} once earlier history is corrected. Delete this payment and record it again`),
          );
        }
        await this.duesRepo.update(due.id, {
          ...due,
          type: EDueType.PAID,
          dueAmount: 0,
        });
        dueId = due.id;

        loan.amountRemaining = this.round(Number(loan.amountRemaining) - Number(due.principalAmount));
        loan.amountPaid = this.round(Number(loan.amountPaid) + Number(due.principalAmount));
        loan.interestRemaining = this.round(Number(loan.interestRemaining) - Number(due.interestAmount));
        loan.interestPaid = this.round(Number(loan.interestPaid) + Number(due.interestAmount));
        effect.amountRemainingDelta = -Number(due.principalAmount);
        effect.amountPaidDelta = Number(due.principalAmount);
        effect.interestRemainingDelta = -Number(due.interestAmount);
        effect.interestPaidDelta = Number(due.interestAmount);
        break;
      }
      default:
        throw new BadRequestException('Unsupported transaction type for replay');
    }

    if (Number(loan.amountPaid) < 0 || Number(loan.interestPaid) < 0) {
      throw new BadRequestException(this.blockedBy(transaction, 'it would drive paid totals negative'));
    }
    if (Number(loan.amountRemaining) < 0 || Number(loan.interestRemaining) < 0) {
      throw new BadRequestException(this.blockedBy(transaction, 'it would drive outstanding balances negative'));
    }

    await this.saveBalances(loanId, loan);

    if (rebuildSchedule) {
      await this.loanService.recalculateDuesForLoan(loanId, createdBy);
    }

    return { effect: this.roundEffect(effect), periodsAtCreation, dueId };
  }

  private async findUnpaidDueOnDate(
    loanId: string,
    dueDate: number | undefined,
    transaction: Transaction,
  ): Promise<Due> {
    if (dueDate == null) {
      throw new BadRequestException(this.blockedBy(transaction, 'its due date is unknown'));
    }
    const unpaid = await this.duesRepo.findByLoanIdAndType(loanId, UNPAID_DUE_TYPES);
    const match = unpaid.find((due) => this.startOfDay(due.dueDate) === dueDate);
    if (!match) {
      throw new BadRequestException(
        this.blockedBy(transaction, 'the due it paid is no longer part of the schedule once earlier history is corrected. Delete this payment and record it again'),
      );
    }
    return match;
  }

  private async persistAppliedEffects(applied: AppliedEffect[], createdBy: string): Promise<void> {
    for (const entry of applied) {
      const updated = await this.transactionsRepo.applyReplayResult(entry.transactionId, createdBy, {
        dueId: entry.dueId,
        effect: entry.effect,
        periodsAtCreation: entry.periodsAtCreation,
      });
      if (!updated) {
        throw new NotFoundException('Transaction not found');
      }
    }
  }

  private findEffect(applied: AppliedEffect[], transactionId: string): LoanEffect {
    const match = applied.find((entry) => entry.transactionId === transactionId);
    return match ? match.effect : emptyLoanEffect();
  }

  private async captureSignature(loan: Loan, createdBy: string): Promise<LoanStateSignature> {
    const current = await this.loansRepo.findById(loan.id, createdBy);
    if (!current) {
      throw new NotFoundException('Loan not found');
    }
    const dues = await this.duesRepo.findByLoanId(loan.id);
    const describe = (due: Due) =>
      [
        this.startOfDay(due.dueDate),
        this.round(Number(due.principalAmount)),
        this.round(Number(due.interestAmount)),
      ].join('|');

    return {
      amountRemaining: this.round(Number(current.amountRemaining)),
      amountPaid: this.round(Number(current.amountPaid)),
      interestRemaining: this.round(Number(current.interestRemaining)),
      interestPaid: this.round(Number(current.interestPaid)),
      paidDues: dues.filter((d) => d.type === EDueType.PAID).map(describe).sort(),
      unpaidDues: dues.filter((d) => d.type !== EDueType.PAID).map(describe).sort(),
    };
  }

  private signaturesMatch(a: LoanStateSignature, b: LoanStateSignature): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private async saveBalances(loanId: string, loan: Loan): Promise<void> {
    const updated = await this.loansRepo.update(loanId, loan);
    if (!updated) {
      throw new NotFoundException('Loan not found');
    }
  }

  private topUpInterest(loan: Loan, amount: number, periods: number): number {
    const percentage = Number(loan.interestPercentage);
    if (loan.interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
      const rate = percentage / 100;
      return this.round(amount * (Math.pow(1 + rate, periods) - 1));
    }
    return this.round((percentage * amount * periods) / 100);
  }

  private blockedBy(transaction: Transaction, reason: string): string {
    const when = transaction.createdAt
      ? new Date(transaction.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      : 'an unknown date';
    return `Cannot apply this correction: the ${transaction.transactionType} recorded on ${when} becomes invalid because ${reason}.`;
  }

  private describe(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    return 'unknown reason';
  }

  private roundEffect(effect: LoanEffect): LoanEffect {
    return {
      amountRemainingDelta: this.round(effect.amountRemainingDelta),
      amountPaidDelta: this.round(effect.amountPaidDelta),
      interestRemainingDelta: this.round(effect.interestRemainingDelta),
      interestPaidDelta: this.round(effect.interestPaidDelta),
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private startOfDay(date: Date | string): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
}
