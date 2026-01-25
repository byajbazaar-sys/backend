import { Inject, Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Transaction, Due } from '../domain';
import { ITransactionsRepository, TRANSACTIONS_REPOSITORY } from '../repository';
import { ITransactionService } from './i-transaction.service';
import { UpdateTransactionRequestModel } from '../models';
import { TransactionsFilterOptions, DuesFilterOptions } from '../options';
import { Paged, toPaged } from '@shared-libs';
import { LOANS_REPOSITORY, ILoansRepository, ELoanStatus, Loan } from '../../loans';
import { ETransactionType } from '../enums';
import { DUES_REPOSITORY, EDueType, IDuesRepository } from '../../../shared';

@Injectable()
export class TransactionService implements ITransactionService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactionsRepo: ITransactionsRepository,
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
  ) { }

  async create(data: Transaction): Promise<Transaction> {
    try {
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
        if (data.dueId) {
          if (due.interestAmount < transaction.amount) {
            throw new BadRequestException('Interest amount should be less than or equal to due interest amount');
          }
          due.interestAmount -= transaction.amount;
        }
        loan.interestRemaining -= transaction.amount;
        loan.interestPaid += transaction.amount;
      }
      if (transaction.transactionType === ETransactionType.PRINCIPAL) {
        if (loan.amountRemaining < transaction.amount) {
          throw new BadRequestException('Amount remaining is less than transaction amount');
        }
        if (data.dueId) {
          if (due.principalAmount < transaction.amount) {
            throw new BadRequestException('Principal amount should be less than or equal to due principal amount');
          }
          due.principalAmount -= transaction.amount;
        }
        loan.amountRemaining -= transaction.amount;
        loan.amountPaid += transaction.amount;
      }
      if (transaction.transactionType === ETransactionType.TOP_UP) {
        loan.amountRemaining += transaction.amount;
      }

      if (data.dueId) {
        due.dueAmount -= transaction.amount;
        if (data.transactionType === ETransactionType.DUE_PAYMENT) {
          if (due.dueAmount != transaction.amount) {
            throw new BadRequestException('For due payment, transaction amount should be equal to due amount');
          }
          due.type = EDueType.PAID;
        }

        await this.duesRepo.update(data.dueId, due);
      }

      return transaction;
    } catch (err) {
      throw err;
    }
  }

  async getById(id: string, createdBy: string): Promise<Transaction> {
    try {
      const transaction = await this.transactionsRepo.findById(id, createdBy);
      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }
      return transaction;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }
  }

  async getTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>> {
    try {
      const result = await this.transactionsRepo.listTransactions(params);
      return result;
    } catch (err) {
      throw err;
    }
  }

  async delete(id: string, createdBy: string): Promise<void> {
    try {
      const existingTransaction = await this.transactionsRepo.findById(id, createdBy);
      if (!existingTransaction) {
        throw new NotFoundException('Transaction not found');
      }

      await this.transactionsRepo.delete(id);
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ForbiddenException) {
        throw err;
      }
      throw err;
    }
  }

  async getDues(params: DuesFilterOptions): Promise<Paged<Due>> {
    try {
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
      return dues;
    } catch (err) {
      throw err;
    }
  }

  async updateDues(): Promise<number> {
    try {
      const updatedCount = await this.duesRepo.updatePastDues();
      return updatedCount;
    } catch (err) {
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
