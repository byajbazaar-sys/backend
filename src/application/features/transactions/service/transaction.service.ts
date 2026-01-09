import { Inject, Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Transaction, Due } from '../domain';
import { ITransactionsRepository, TRANSACTIONS_REPOSITORY } from '../repository';
import { ITransactionService } from './i-transaction.service';
import { UpdateTransactionRequestModel } from '../models';
import { TransactionsFilterOptions, DuesFilterOptions } from '../options';
import { Paged, getPaginationValues, toPaged, ESortOrder } from '@shared-libs';
import { LOANS_REPOSITORY, ILoansRepository, ELoanStatus } from '../../loans';
import { ETransactionType } from '../enums';
import { DUES_REPOSITORY, IDuesRepository } from '../../../shared';

@Injectable()
export class TransactionService implements ITransactionService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactionsRepo: ITransactionsRepository,
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
  ) {}

  async create(data: Transaction): Promise<Transaction> {
    try {
      const loan = await this.loansRepo.findById(data.loanId);
      data.customerId = loan.customerId;
      if (!loan) {
        throw new NotFoundException('Loan not found');
      }
      if (loan.status === ELoanStatus.CLOSED) {
        throw new BadRequestException('Loan is closed');
      }
      if (data.amount > loan.amountRemaining) {
        throw new BadRequestException('Amount is greater than loan remaining');
      }
      const transaction = await this.transactionsRepo.create(data);
      if (transaction.transactionType === ETransactionType.INTEREST) {
        if (loan.interestRemaining < transaction.amount) {
          throw new BadRequestException('Interest remaining is less than transaction amount');
        }
        loan.interestRemaining -= transaction.amount;
      }
      if (transaction.transactionType === ETransactionType.PRINCIPAL) {
        if (loan.amountRemaining < transaction.amount) {
          throw new BadRequestException('Amount remaining is less than transaction amount');
        }
        loan.amountRemaining -= transaction.amount;
      }
      if (transaction.transactionType === ETransactionType.TOP_UP) {
        loan.amountRemaining += transaction.amount;
      }
      await this.loansRepo.update(data.loanId, {
        amountRemaining: loan.amountRemaining,
        interestRemaining: loan.interestRemaining,
      });
      return transaction;
      return null;
    } catch (err) {
      throw err;
    }
  }

  async getById(id: string): Promise<Transaction> {
    try {
      const transaction = await this.transactionsRepo.findById(id);
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

  async update(id: string, body: UpdateTransactionRequestModel, userId: string): Promise<Transaction> {
    try {
      const existingTransaction = await this.transactionsRepo.findById(id);
      if (!existingTransaction) {
        throw new NotFoundException('Transaction not found');
      }

      // Check if user is authorized to update this transaction
      if (existingTransaction.createdBy !== userId) {
        throw new ForbiddenException('You are not authorized to update this transaction');
      }

      const updateData: Partial<Transaction> = {};
      if (body.loanId !== undefined) updateData.loanId = body.loanId;
      if (body.amount !== undefined) updateData.amount = body.amount;
      if (body.transactionType !== undefined) updateData.transactionType = body.transactionType;
      if (body.paidIn !== undefined) updateData.paidIn = body.paidIn;

      const updatedTransaction = await this.transactionsRepo.update(id, updateData);
      if (!updatedTransaction) {
        throw new NotFoundException('Transaction not found');
      }

      return updatedTransaction;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ForbiddenException) {
        throw err;
      }
      throw err;
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    try {
      const existingTransaction = await this.transactionsRepo.findById(id);
      if (!existingTransaction) {
        throw new NotFoundException('Transaction not found');
      }

      // Check if user is authorized to delete this transaction
      if (existingTransaction.createdBy !== userId) {
        throw new ForbiddenException('You are not authorized to delete this transaction');
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
      const dues = await this.duesRepo.listDues(params);
      return dues;
    } catch (err) {
      throw err;
    }
  }
}
