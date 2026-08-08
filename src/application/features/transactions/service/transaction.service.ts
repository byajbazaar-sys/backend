import { Inject, Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { emptyLoanEffect, LoanEffect, Transaction, UpdateTransactionData } from '../domain';
import { ITransactionService } from './i-transaction.service';
import { TransactionsFilterOptions, TransactionsDownloadFilterOptions, DuesFilterOptions } from '../options';
import { Paged, toPaged } from '@shared-libs';
import { LOANS_REPOSITORY, ILoansRepository, ELoanStatus, Loan, ILoanService, LOAN_SERVICE, EInterestCalculationMethod, assertLoanVersion } from '../../loans';
import { ETransactionType, ETransactionPaidIn } from '../enums';
import { DUES_REPOSITORY, EDueType, IDuesRepository, Due, ITransactionsRepository, TRANSACTIONS_REPOSITORY, IUnitOfWork, UNIT_OF_WORK } from '../../../shared';

@Injectable()
export class TransactionService implements ITransactionService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactionsRepo: ITransactionsRepository,
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    @Inject(LOAN_SERVICE) private readonly loanService: ILoanService,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @InjectPinoLogger(TransactionService.name) private readonly logger: PinoLogger,
  ) { }

  async create(data: Transaction, expectedLoanVersion?: number): Promise<Transaction> {
    return this.unitOfWork.runInTransaction(() =>
      this.createWithinTransaction(data, expectedLoanVersion),
    );
  }

  private async createWithinTransaction(
    data: Transaction,
    expectedLoanVersion?: number,
  ): Promise<Transaction> {
    try {
      this.logger.info({ loanId: data.loanId, dueId: data.dueId, transactionType: data.transactionType, amount: data.amount }, 'Creating transaction');
      await this.lockLoanForWrite(data.loanId, data.dueId, data.createdBy, expectedLoanVersion);
      let { loan, due } = await this.validateTransaction(data);
      if (!loan && due) {
        loan = await this.loansRepo.findById(due.loanId, data.createdBy);
        data.loanId = loan.id;
      }
      data.customerId = loan.customerId;

      const effect = emptyLoanEffect();

      if (data.transactionType === ETransactionType.INTEREST) {
        if (loan.interestRemaining < data.amount) {
          throw new BadRequestException('Transaction amount is greater than interest remaining(' + loan.interestRemaining + ')');
        }
        loan.interestRemaining -= data.amount;
        loan.interestPaid += data.amount;
        effect.interestRemainingDelta = -data.amount;
        effect.interestPaidDelta = data.amount;
      }


      if (data.transactionType === ETransactionType.PRINCIPAL) {
        if (loan.amountRemaining < data.amount) {
          throw new BadRequestException('Amount remaining is less than transaction amount');
        }
        loan.amountRemaining -= data.amount;
        loan.amountPaid += data.amount;
        effect.amountRemainingDelta = -data.amount;
        effect.amountPaidDelta = data.amount;
      }

      if (data.transactionType === ETransactionType.TOP_UP) {
        if (data.amount <= 0) {
          throw new BadRequestException('Top up amount must be greater than zero');
        }
        loan.amountRemaining += data.amount;
        effect.amountRemainingDelta = data.amount;
        // Add interest for the additional principal over remaining periods
        const unpaidDues = await this.duesRepo.findByLoanIdAndType(data.loanId, [EDueType.UPCOMING_DUE, EDueType.PAST_DUE]);
        const remainingTenure = unpaidDues.length;
        data.periodsAtCreation = remainingTenure;
        if (remainingTenure > 0) {
          const interestAdded = this.calculateTopUpInterest(loan, data.amount, remainingTenure);
          loan.interestRemaining += interestAdded;
          effect.interestRemainingDelta = interestAdded;
        }
        this.logger.info(
          { loanId: loan.id, topUpAmount: data.amount, remainingTenure },
          'Loan principal and interest increased due to top-up',
        );
      }

      if (data.dueId && data.transactionType === ETransactionType.DUE_PAYMENT) {
        if (due.dueAmount != data.amount) {
          throw new BadRequestException('For due payment, transaction amount should be equal to due amount');
        }
        due.type = EDueType.PAID;
        due.dueAmount -= data.amount;
        await this.duesRepo.update(data.dueId, due);

        // Update loan amounts: principal portion reduces remaining, increases paid; interest same
        loan.amountRemaining -= due.principalAmount;
        loan.amountPaid += due.principalAmount;
        loan.interestRemaining -= due.interestAmount;
        loan.interestPaid += due.interestAmount;
        effect.amountRemainingDelta = -Number(due.principalAmount);
        effect.amountPaidDelta = Number(due.principalAmount);
        effect.interestRemainingDelta = -Number(due.interestAmount);
        effect.interestPaidDelta = Number(due.interestAmount);
      }
      await this.loansRepo.update(data.loanId, loan);

      if (
        data.transactionType === ETransactionType.INTEREST ||
        data.transactionType === ETransactionType.PRINCIPAL ||
        data.transactionType === ETransactionType.TOP_UP
      ) {
        await this.loanService.recalculateDuesForLoan(data.loanId, data.createdBy);
      }

      const recordedEffect = this.roundEffect(effect);
      data.amountRemainingDelta = recordedEffect.amountRemainingDelta;
      data.amountPaidDelta = recordedEffect.amountPaidDelta;
      data.interestRemainingDelta = recordedEffect.interestRemainingDelta;
      data.interestPaidDelta = recordedEffect.interestPaidDelta;
      data.loanSeq = await this.loansRepo.allocateTransactionSeq(data.loanId, data.createdBy);

      const transaction = await this.transactionsRepo.create(data);

      this.logger.info({ transactionId: transaction.id, loanId: loan.id }, 'Transaction created successfully');
      return transaction;
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      this.logger.error({ err, loanId: data.loanId, dueId: data.dueId }, 'Error creating transaction');
      throw err;
    }
  }

  async getById(id: string, createdBy: string): Promise<Transaction> {
    try {
      this.logger.debug({ transactionId: id, createdBy }, 'Getting transaction by ID');
      const transaction = await this.transactionsRepo.findById(id, createdBy);
      if (!transaction) {
        this.logger.warn({ transactionId: id, createdBy }, 'Transaction not found');
        throw new NotFoundException('Transaction not found');
      }
      return transaction;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, transactionId: id, createdBy }, 'Error getting transaction by ID');
      throw err;
    }
  }

  async update(
    id: string,
    updates: UpdateTransactionData,
    createdBy: string,
  ): Promise<Transaction> {
    return this.unitOfWork.runInTransaction(() =>
      this.updateWithinTransaction(id, updates, createdBy),
    );
  }

  private async updateWithinTransaction(
    id: string,
    updates: UpdateTransactionData,
    createdBy: string,
  ): Promise<Transaction> {
    const existing = await this.loadForWrite(id, createdBy, updates.expectedLoanVersion);

    let current = existing;

    if (updates.amount !== undefined) {
      const newAmount = this.roundMoney(Number(updates.amount));
      const oldAmount = this.roundMoney(Number(existing.amount));
      if (newAmount !== oldAmount) {
        current = await this.reviseLatestAmount(existing, newAmount, createdBy);
      }
    }

    if (updates.paidIn !== undefined && updates.paidIn !== current.paidIn) {
      const updated = await this.transactionsRepo.updatePaidIn(id, createdBy, updates.paidIn);
      if (!updated) {
        throw new NotFoundException('Transaction not found');
      }
      this.logger.info({ transactionId: id, paidIn: updates.paidIn }, 'Transaction payment method updated');
      current = updated;
    }

    return current;
  }

  private async reviseLatestAmount(
    existing: Transaction,
    newAmount: number,
    createdBy: string,
  ): Promise<Transaction> {
    const loan = await this.assertLatestOnOpenLoan(existing, createdBy);

    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      throw new BadRequestException('Invalid transaction amount');
    }

    if (existing.transactionType === ETransactionType.DUE_PAYMENT) {
      throw new BadRequestException('Due payment amount cannot be edited; delete and re-record the payment instead');
    }

    await this.rollbackTransactionEffects(existing, loan, createdBy);

    const loanAfterRollback = await this.loansRepo.findById(existing.loanId, createdBy);
    if (!loanAfterRollback) {
      throw new NotFoundException('Loan not found');
    }

    const revised = { ...existing, amount: newAmount };
    const { effect, periodsAtCreation } = await this.applyTransactionEffects(
      revised,
      loanAfterRollback,
      createdBy,
    );

    const updated = await this.transactionsRepo.updateAmount(
      existing.id,
      createdBy,
      newAmount,
      effect,
      periodsAtCreation,
    );
    if (!updated) {
      throw new NotFoundException('Transaction not found');
    }

    this.logger.info(
      { transactionId: existing.id, oldAmount: existing.amount, newAmount },
      'Latest transaction amount revised',
    );
    return updated;
  }

  /**
   * Every balance change on a loan is a read-modify-write, so writers have to
   * queue on the loan row rather than interleave. Taken before the first read
   * of the loan; released when the surrounding transaction commits.
   */
  private async lockLoanForWrite(
    loanId: string,
    dueId: string,
    createdBy: string,
    expectedLoanVersion?: number,
  ): Promise<void> {
    let targetLoanId = loanId;
    if (!targetLoanId && dueId) {
      const due = await this.duesRepo.findById(dueId, createdBy);
      targetLoanId = due?.loanId;
    }
    if (targetLoanId) {
      const loan = await this.loansRepo.lockLoan(targetLoanId, createdBy);
      assertLoanVersion(loan, expectedLoanVersion);
    }
  }

  /**
   * Re-reads the transaction once its loan is locked, since a concurrent writer
   * could have changed it between the lookup that told us which loan to lock.
   */
  private async loadForWrite(
    id: string,
    createdBy: string,
    expectedLoanVersion?: number,
  ): Promise<Transaction> {
    const initial = await this.transactionsRepo.findById(id, createdBy);
    if (!initial) {
      throw new NotFoundException('Transaction not found');
    }
    await this.lockLoanForWrite(initial.loanId, undefined, createdBy, expectedLoanVersion);

    const current = await this.transactionsRepo.findById(id, createdBy);
    if (!current) {
      throw new NotFoundException('Transaction not found');
    }
    return current;
  }

  private async assertLatestOnOpenLoan(transaction: Transaction, createdBy: string): Promise<Loan> {
    const latest = await this.transactionsRepo.findLatestByLoanId(transaction.loanId, createdBy);
    if (!latest || latest.id !== transaction.id) {
      throw new BadRequestException('Only the latest transaction on this loan can be modified');
    }

    const loan = await this.loansRepo.findById(transaction.loanId, createdBy);
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    if (loan.status === ELoanStatus.CLOSED) {
      throw new BadRequestException('Cannot modify transactions on a closed loan');
    }
    return loan;
  }

  async getTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>> {
    try {
      this.logger.debug({ createdBy: params.createdBy }, 'Getting transactions');
      const result = await this.transactionsRepo.listTransactions(params);
      return result;
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting transactions');
      throw err;
    }
  }

  async getTransactionsForDownload(params: TransactionsDownloadFilterOptions): Promise<Transaction[]> {
    try {
      this.logger.debug({ createdBy: params.createdBy }, 'Getting transactions for download');
      return this.transactionsRepo.listAllTransactions(params);
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting transactions for download');
      throw err;
    }
  }

  async delete(id: string, createdBy: string, expectedLoanVersion?: number): Promise<void> {
    return this.unitOfWork.runInTransaction(() =>
      this.deleteWithinTransaction(id, createdBy, expectedLoanVersion),
    );
  }

  private async deleteWithinTransaction(
    id: string,
    createdBy: string,
    expectedLoanVersion?: number,
  ): Promise<void> {
    try {
      this.logger.info({ transactionId: id, createdBy }, 'Deleting transaction');
      const existing = await this.loadForWrite(id, createdBy, expectedLoanVersion);

      const loan = await this.assertLatestOnOpenLoan(existing, createdBy);

      const amount = Number(existing.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('Invalid transaction amount');
      }

      await this.rollbackTransactionEffects(existing, loan, createdBy);
      await this.transactionsRepo.delete(id);
      this.logger.info({ transactionId: id, loanId: existing.loanId }, 'Transaction deleted with rollback');
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      this.logger.error({ err, transactionId: id, createdBy }, 'Error deleting transaction');
      throw err;
    }
  }

  private async rollbackTransactionEffects(
    transaction: Transaction,
    loan: Loan,
    createdBy: string,
  ): Promise<void> {
    const loanId = transaction.loanId;
    const effect = await this.resolveRollbackEffect(transaction, createdBy);

    loan.amountRemaining = this.roundMoney(Number(loan.amountRemaining) - effect.amountRemainingDelta);
    loan.amountPaid = this.roundMoney(Number(loan.amountPaid) - effect.amountPaidDelta);
    loan.interestRemaining = this.roundMoney(Number(loan.interestRemaining) - effect.interestRemainingDelta);
    loan.interestPaid = this.roundMoney(Number(loan.interestPaid) - effect.interestPaidDelta);

    if (Number(loan.amountPaid) < 0 || Number(loan.interestPaid) < 0) {
      throw new BadRequestException('Rollback would result in negative paid amounts');
    }
    if (Number(loan.amountRemaining) < 0 || Number(loan.interestRemaining) < 0) {
      throw new BadRequestException('Rollback would result in negative remaining balances');
    }

    if (transaction.transactionType === ETransactionType.DUE_PAYMENT) {
      await this.restoreDueAfterRollback(transaction, createdBy);
    }

    await this.loansRepo.update(loanId, loan);

    if (
      transaction.transactionType === ETransactionType.INTEREST ||
      transaction.transactionType === ETransactionType.PRINCIPAL ||
      transaction.transactionType === ETransactionType.TOP_UP
    ) {
      await this.loanService.recalculateDuesForLoan(loanId, createdBy);
    }
  }

  /**
   * Prefers the effect recorded when the transaction was created. Older rows
   * predate that tracking, so their effect is re-derived — which is only exact
   * for types whose effect is a direct function of the amount or of the due row.
   */
  private async resolveRollbackEffect(
    transaction: Transaction,
    createdBy: string,
  ): Promise<LoanEffect> {
    const recorded = this.getRecordedEffect(transaction);
    if (recorded) {
      return recorded;
    }

    const amount = Number(transaction.amount);

    switch (transaction.transactionType) {
      case ETransactionType.INTEREST:
        return {
          ...emptyLoanEffect(),
          interestRemainingDelta: -amount,
          interestPaidDelta: amount,
        };
      case ETransactionType.PRINCIPAL:
        return {
          ...emptyLoanEffect(),
          amountRemainingDelta: -amount,
          amountPaidDelta: amount,
        };
      case ETransactionType.DUE_PAYMENT: {
        const due = await this.loadPaidDueOrThrow(transaction, createdBy);
        return {
          amountRemainingDelta: -Number(due.principalAmount),
          amountPaidDelta: Number(due.principalAmount),
          interestRemainingDelta: -Number(due.interestAmount),
          interestPaidDelta: Number(due.interestAmount),
        };
      }
      case ETransactionType.TOP_UP:
        // The interest a top-up added depends on the unpaid due count at that
        // moment, which this row never captured. Recomputing it from today's
        // schedule would silently remove the wrong amount.
        throw new BadRequestException(
          'This top-up predates interest tracking and cannot be reversed automatically. Please adjust the loan manually.',
        );
      default:
        throw new BadRequestException('Unsupported transaction type for rollback');
    }
  }

  private getRecordedEffect(transaction: Transaction): LoanEffect {
    const effect: LoanEffect = {
      amountRemainingDelta: Number(transaction.amountRemainingDelta ?? 0),
      amountPaidDelta: Number(transaction.amountPaidDelta ?? 0),
      interestRemainingDelta: Number(transaction.interestRemainingDelta ?? 0),
      interestPaidDelta: Number(transaction.interestPaidDelta ?? 0),
    };
    const anyRecorded = Object.values(effect).some((value) => Number.isFinite(value) && value !== 0);
    return anyRecorded ? effect : null;
  }

  private async loadPaidDueOrThrow(transaction: Transaction, createdBy: string): Promise<Due> {
    if (!transaction.dueId) {
      throw new BadRequestException('Due payment transaction is missing due reference');
    }
    const due = await this.duesRepo.findById(transaction.dueId, createdBy);
    if (!due) {
      throw new BadRequestException('Linked due not found for this payment');
    }
    if (due.type !== EDueType.PAID) {
      throw new BadRequestException('Linked due is not marked paid; cannot roll back safely');
    }
    return due;
  }

  private async restoreDueAfterRollback(transaction: Transaction, createdBy: string): Promise<void> {
    const due = await this.loadPaidDueOrThrow(transaction, createdBy);
    await this.duesRepo.update(transaction.dueId, {
      ...due,
      type: this.resolveUnpaidDueType(due.dueDate),
      dueAmount: this.roundMoney(Number(transaction.amount)),
    });
  }

  private async applyTransactionEffects(
    transaction: Transaction,
    loan: Loan,
    createdBy: string,
  ): Promise<{ effect: LoanEffect; periodsAtCreation?: number }> {
    const amount = Number(transaction.amount);
    const loanId = transaction.loanId;
    const effect = emptyLoanEffect();
    let periodsAtCreation: number;

    switch (transaction.transactionType) {
      case ETransactionType.INTEREST: {
        if (Number(loan.interestRemaining) < amount) {
          throw new BadRequestException(
            'Transaction amount is greater than interest remaining(' + loan.interestRemaining + ')',
          );
        }
        loan.interestRemaining = this.roundMoney(Number(loan.interestRemaining) - amount);
        loan.interestPaid = this.roundMoney(Number(loan.interestPaid) + amount);
        effect.interestRemainingDelta = -amount;
        effect.interestPaidDelta = amount;
        break;
      }
      case ETransactionType.PRINCIPAL: {
        if (Number(loan.amountRemaining) < amount) {
          throw new BadRequestException('Amount remaining is less than transaction amount');
        }
        loan.amountRemaining = this.roundMoney(Number(loan.amountRemaining) - amount);
        loan.amountPaid = this.roundMoney(Number(loan.amountPaid) + amount);
        effect.amountRemainingDelta = -amount;
        effect.amountPaidDelta = amount;
        break;
      }
      case ETransactionType.TOP_UP: {
        loan.amountRemaining = this.roundMoney(Number(loan.amountRemaining) + amount);
        effect.amountRemainingDelta = amount;
        // Correcting a top-up keeps the tenure it was originally priced against;
        // today's schedule may have moved on since.
        if (transaction.periodsAtCreation != null) {
          periodsAtCreation = Number(transaction.periodsAtCreation);
        } else {
          const unpaidDues = await this.duesRepo.findByLoanIdAndType(loanId, [
            EDueType.UPCOMING_DUE,
            EDueType.PAST_DUE,
          ]);
          periodsAtCreation = unpaidDues.length;
        }
        if (periodsAtCreation > 0) {
          const interestAdded = this.calculateTopUpInterest(loan, amount, periodsAtCreation);
          loan.interestRemaining = this.roundMoney(Number(loan.interestRemaining) + interestAdded);
          effect.interestRemainingDelta = interestAdded;
        }
        break;
      }
      default:
        throw new BadRequestException('Unsupported transaction type for amount update');
    }

    if (Number(loan.amountPaid) < 0 || Number(loan.interestPaid) < 0) {
      throw new BadRequestException('Update would result in negative paid amounts');
    }
    if (Number(loan.amountRemaining) < 0 || Number(loan.interestRemaining) < 0) {
      throw new BadRequestException('Update would result in negative remaining balances');
    }

    await this.loansRepo.update(loanId, loan);

    if (
      transaction.transactionType === ETransactionType.INTEREST ||
      transaction.transactionType === ETransactionType.PRINCIPAL ||
      transaction.transactionType === ETransactionType.TOP_UP
    ) {
      await this.loanService.recalculateDuesForLoan(loanId, createdBy);
    }

    return { effect: this.roundEffect(effect), periodsAtCreation };
  }

  private calculateTopUpInterest(loan: Loan, amount: number, periods: number): number {
    const percentage = Number(loan.interestPercentage);
    if (loan.interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
      const rate = percentage / 100;
      return this.roundMoney(amount * (Math.pow(1 + rate, periods) - 1));
    }
    return this.roundMoney((percentage * amount * periods) / 100);
  }

  private roundEffect(effect: LoanEffect): LoanEffect {
    return {
      amountRemainingDelta: this.roundMoney(effect.amountRemainingDelta),
      amountPaidDelta: this.roundMoney(effect.amountPaidDelta),
      interestRemainingDelta: this.roundMoney(effect.interestRemainingDelta),
      interestPaidDelta: this.roundMoney(effect.interestPaidDelta),
    };
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private resolveUnpaidDueType(dueDate: Date): EDueType {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today ? EDueType.PAST_DUE : EDueType.UPCOMING_DUE;
  }

  async getDueById(id: string, createdBy: string): Promise<Due> {
    try {
      this.logger.debug({ dueId: id, createdBy }, 'Getting due by ID');
      const due = await this.duesRepo.findByIdWithDetails(id, createdBy);
      if (!due) {
        this.logger.warn({ dueId: id, createdBy }, 'Due not found');
        throw new NotFoundException('Due not found');
      }
      return due;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, dueId: id, createdBy }, 'Error getting due by ID');
      throw err;
    }
  }

  async getDues(params: DuesFilterOptions): Promise<Paged<Due>> {
    try {
      this.logger.debug({ createdBy: params.createdBy, loanIds: params.loanIds }, 'Getting dues');
      // Get all open loans for the user to filter dues
      const openLoans = await this.loansRepo.findByCreatedBy(params.createdBy);
      const openLoanIds = openLoans.filter((loan) => loan.status === ELoanStatus.OPEN).map((loan) => loan.id);

      // If no open loans, return empty result
      if (openLoanIds.length === 0) {
        return toPaged(Due, {
          items: [],
          page: params.pageNumber,
          perPage: params.pageSize,
          totalCount: 0,
        });
      }

      // Filter loanIds to only include open loans
      if (params.loanIds && params.loanIds.length > 0) {
        // Only include loanIds that are in open loans
        params.loanIds = params.loanIds.filter((loanId) => openLoanIds.includes(loanId));
        // If after filtering no loanIds remain, return empty result
        if (params.loanIds.length === 0) {
          return toPaged(Due, {
            items: [],
            page: params.pageNumber,
            perPage: params.pageSize,
            totalCount: 0,
          });
        }
      } else {
        // If no loanIds specified, use all open loan IDs
        params.loanIds = openLoanIds;
      }

      const dues = await this.duesRepo.listDues(params);
      this.logger.debug({ createdBy: params.createdBy, totalDues: dues.totalCount }, 'Dues retrieved successfully');
      return dues;
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting dues');
      throw err;
    }
  }

  async updateDues(): Promise<number> {
    try {
      this.logger.info('Updating past dues');
      const updatedCount = await this.duesRepo.updatePastDues();
      this.logger.info({ updatedCount }, 'Past dues updated successfully');
      return updatedCount;
    } catch (err) {
      this.logger.error({ err }, 'Error updating past dues');
      throw err;
    }
  }

  private async validateTransaction(data: Transaction): Promise<{ loan?: Loan; due?: Due }> {
    try {
      const loan = await this.loansRepo.findById(data?.loanId, data.createdBy);
      const due = await this.duesRepo.findById(data?.dueId, data.createdBy);
      if (data.loanId && data.dueId) {
        if (!loan) {
          throw new NotFoundException('Loan not found');
        }
        if (!due) {
          throw new NotFoundException('Due not found');
        }
        if (due.loanId !== loan.id) {
          throw new BadRequestException('Due does not belong to the loan');
        }
      }
      if (data.loanId) {
        if (!loan) {
          throw new NotFoundException('Loan not found');
        }

        if (loan.status === ELoanStatus.CLOSED) {
          throw new BadRequestException('Loan is closed');
        }
        const totalRemaining = loan.amountRemaining + loan.interestRemaining;
        if (data.amount > totalRemaining && data.transactionType !== ETransactionType.TOP_UP) {
          throw new BadRequestException('Amount should not be greater than loan remaining(' + totalRemaining + ')');
        }
      }
      if (data.dueId) {
        if (!due) {
          throw new NotFoundException('Due not found');
        }

        if (due.type === EDueType.PAID) {
          throw new BadRequestException('Due is already paid');
        }

        if (due.dueAmount < data.amount) {
          throw new BadRequestException('transaction should be less than due amount');
        }
      }
      return { loan, due };
    } catch (err) {
      throw err;
    }
  }
}
