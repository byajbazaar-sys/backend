import { Inject, Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Transaction, Due } from '../domain';
import { ITransactionsRepository, TRANSACTIONS_REPOSITORY } from '../repository';
import { ITransactionService } from './i-transaction.service';
import { TransactionsFilterOptions, DuesFilterOptions } from '../options';
import { Paged, toPaged } from '@shared-libs';
import { LOANS_REPOSITORY, ILoansRepository, ELoanStatus, Loan, ILoanService, LOAN_SERVICE, EInterestCalculationMethod } from '../../loans';
import { ETransactionType } from '../enums';
import { DUES_REPOSITORY, EDueType, IDuesRepository } from '../../../shared';

@Injectable()
export class TransactionService implements ITransactionService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactionsRepo: ITransactionsRepository,
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    @Inject(LOAN_SERVICE) private readonly loanService: ILoanService,
    @InjectPinoLogger(TransactionService.name) private readonly logger: PinoLogger,
  ) { }

  async create(data: Transaction): Promise<Transaction> {
    try {
      this.logger.info({ loanId: data.loanId, dueId: data.dueId, transactionType: data.transactionType, amount: data.amount }, 'Creating transaction');
      let { loan, due } = await this.validateTransaction(data);
      if (!loan && due) {
        loan = await this.loansRepo.findById(due.loanId, data.createdBy);
        data.loanId = loan.id;
      }
      data.customerId = loan.customerId;

      const transaction = await this.transactionsRepo.create(data);

      if (transaction.transactionType === ETransactionType.INTEREST) {
        if (loan.interestRemaining < transaction.amount) {
          throw new BadRequestException('Interest remaining is less than transaction amount');
        }
        loan.interestRemaining -= transaction.amount;
        loan.interestPaid += transaction.amount;
      }

      if (transaction.transactionType === ETransactionType.PRINCIPAL) {
        if (loan.amountRemaining < transaction.amount) {
          throw new BadRequestException('Amount remaining is less than transaction amount');
        }
        loan.amountRemaining -= transaction.amount;
        loan.amountPaid += transaction.amount;
      }

      if (transaction.transactionType === ETransactionType.TOP_UP) {
        loan.amountRemaining += transaction.amount;
        // Recalculate interest for the additional principal over remaining periods
        const unpaidDues = await this.duesRepo.findByLoanIdAndType(data.loanId, [EDueType.UPCOMING_DUE, EDueType.PAST_DUE]);
        const remainingTenure = unpaidDues.length;
        if (remainingTenure > 0) {
          const rate = loan.interestPercentage / 100;
          if (loan.interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
            loan.interestRemaining += transaction.amount * (Math.pow(1 + rate, remainingTenure) - 1);
          } else {
            loan.interestRemaining += (loan.interestPercentage * transaction.amount * remainingTenure) / 100;
          }
        }
      }

      if (data.dueId && data.transactionType === ETransactionType.DUE_PAYMENT) {
        if (due.dueAmount != transaction.amount) {
          throw new BadRequestException('For due payment, transaction amount should be equal to due amount');
        }
        due.type = EDueType.PAID;
        due.dueAmount -= transaction.amount;
        await this.duesRepo.update(data.dueId, due);
      }
      await this.loansRepo.update(data.loanId, loan);

      if (
        transaction.transactionType === ETransactionType.INTEREST ||
        transaction.transactionType === ETransactionType.PRINCIPAL ||
        transaction.transactionType === ETransactionType.TOP_UP
      ) {
        await this.loanService.recalculateDuesForLoan(data.loanId, data.createdBy);
      }

      this.logger.info({ transactionId: transaction.id, loanId: loan.id }, 'Transaction created successfully');
      return transaction;
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException || err instanceof ForbiddenException) {
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

  async delete(id: string, createdBy: string): Promise<void> {
    try {
      this.logger.info({ transactionId: id, createdBy }, 'Deleting transaction');
      const existingTransaction = await this.transactionsRepo.findById(id, createdBy);
      if (!existingTransaction) {
        this.logger.warn({ transactionId: id, createdBy }, 'Transaction not found for deletion');
        throw new NotFoundException('Transaction not found');
      }

      await this.transactionsRepo.delete(id);
      this.logger.info({ transactionId: id }, 'Transaction deleted successfully');
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, transactionId: id, createdBy }, 'Error deleting transaction');
      throw err;
    }
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
        if (data.amount > loan.amountRemaining) {
          throw new BadRequestException('Amount is greater than loan remaining');
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
