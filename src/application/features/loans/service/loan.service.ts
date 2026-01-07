import { Inject, Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Loan } from '../domain';
import { ILoansRepository, LOANS_REPOSITORY } from './i-loans.repository';
import { ILoanService } from './i-loan.service';
import { UpdateLoanRequestModel } from '../models';
import { LoansFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { ILoanItemsRepository, LOAN_ITEMS_REPOSITORY } from './i-loan-items.repository';
import { IUsersFileStorage, USERS_FILE_STORAGE } from '../../../shared';
import { EInterestCalculationMethod } from '../enums';

@Injectable()
export class LoanService implements ILoanService {
  constructor(
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(LOAN_ITEMS_REPOSITORY) private readonly loanItemsRepo: ILoanItemsRepository,
    @Inject(USERS_FILE_STORAGE) private readonly loansFileStorage: IUsersFileStorage,
  ) {}

  async create(data: Loan): Promise<Loan> {
    try {
      if (data.interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
        data.interestRemaining =
          (data.interestPercentage * data.amountRemaining * (1 + data.interestPercentage / 100) ** data.tenureValue) /
          100;
      } else {
        data.interestRemaining = (data.interestPercentage * data.amountRemaining * data.tenureValue) / 100;
      }
      const loan = await this.loansRepo.create(data);
      for (const loanItem of data.loanItems) {
        if (loanItem.image) {
          const fileExtension = loanItem.image.mimetype.split('/')[1];
          loanItem.imageRef = `loans/items/${loan.id}/${loanItem._id.toString()}.${fileExtension}`;
          this.loansFileStorage.writeAsync(loanItem.imageRef, loanItem.image.buffer, loanItem.image.mimetype);
        }
      }
      await this.loanItemsRepo.bulkInsert(data.loanItems);

      return { ...loan, loanItems: data.loanItems };
    } catch (err) {
      throw err;
    }
  }

  async getById(id: string): Promise<Loan> {
    try {
      const loan = await this.loansRepo.findById(id);
      if (!loan) {
        throw new NotFoundException('Loan not found');
      }
      return loan;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      throw err;
    }
  }

  async getLoans(params: LoansFilterOptions): Promise<Paged<Loan>> {
    try {
      const result = await this.loansRepo.listLoans(params);
      return result;
    } catch (err) {
      throw err;
    }
  }

  async update(id: string, body: UpdateLoanRequestModel, userId: string): Promise<Loan> {
    try {
      const existingLoan = await this.loansRepo.findById(id);
      if (!existingLoan) {
        throw new NotFoundException('Loan not found');
      }

      // Check if user is authorized to update this loan
      if (existingLoan.createdBy !== userId) {
        throw new ForbiddenException('You are not authorized to update this loan');
      }

      const updateData: Partial<Loan> = {};
      if (body.customerId !== undefined) updateData.customerId = body.customerId;
      if (body.tenureType !== undefined) updateData.tenureType = body.tenureType;
      if (body.tenureValue !== undefined) updateData.tenureValue = body.tenureValue;
      if (body.interestCalculationMethod !== undefined)
        updateData.interestCalculationMethod = body.interestCalculationMethod;
      if (body.interestPercentage !== undefined) updateData.interestPercentage = body.interestPercentage;
      if (body.interestType !== undefined) updateData.interestType = body.interestType;

      const updatedLoan = await this.loansRepo.update(id, updateData);
      if (!updatedLoan) {
        throw new NotFoundException('Loan not found');
      }

      return updatedLoan;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      throw err;
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    try {
      const existingLoan = await this.loansRepo.findById(id);
      if (!existingLoan) {
        throw new NotFoundException('Loan not found');
      }

      // Check if user is authorized to delete this loan
      if (existingLoan.createdBy !== userId) {
        throw new ForbiddenException('You are not authorized to delete this loan');
      }

      await this.loansRepo.delete(id);
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      throw err;
    }
  }
}
