import { Inject, Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Loan, LoanStats } from '../domain';
import { ILoansRepository, LOANS_REPOSITORY } from './i-loans.repository';
import { ILoanService } from './i-loan.service';
import { LoansFilterOptions, LoanStatsFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { ILoanItemsRepository, LOAN_ITEMS_REPOSITORY } from './i-loan-items.repository';
import { DUES_REPOSITORY, EDueType, IDuesRepository, IUsersFileStorage, USERS_FILE_STORAGE } from '../../../shared';
import { Due } from '../../transactions';
import { EInterestCalculationMethod, EInterestType, ELoanTenureType } from '../enums';
import { Types } from 'mongoose';

@Injectable()
export class LoanService implements ILoanService {
  constructor(
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(LOAN_ITEMS_REPOSITORY) private readonly loanItemsRepo: ILoanItemsRepository,
    @Inject(USERS_FILE_STORAGE) private readonly loansFileStorage: IUsersFileStorage,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
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

      // Create dues based on loan details
      await this.createDuesForLoan(loan);

      return { ...loan, loanItems: data.loanItems };
    } catch (err) {
      throw err;
    }
  }

  private async createDuesForLoan(loan: Loan): Promise<void> {
    try {
      const {
        interestType,
        tenureType,
        tenureValue,
        amountRemaining, // principal
        interestRemaining, // interest
        customerId,
        createdBy,
        createdAt,
      } = loan;

      const loanId = loan.id || loan._id?.toString();

      if (!loanId) throw new Error('Loan ID is required');
      if (!customerId || !createdBy) {
        throw new Error('Customer ID and Created By are required');
      }

      const numberOfDues = this.calculateNumberOfDues(interestType, tenureType, tenureValue);

      if (numberOfDues <= 0) {
        throw new Error('Invalid number of dues calculated');
      }

      // ✅ Split principal and interest separately
      const principalPerDue = amountRemaining / numberOfDues;
      const interestPerDue = interestRemaining / numberOfDues;

      const dues: Due[] = [];

      const startDate = createdAt ? new Date(createdAt) : new Date();
      startDate.setHours(0, 0, 0, 0);

      for (let i = 0; i < numberOfDues; i++) {
        const dueDate = this.calculateDueDate(startDate, interestType, i + 1);

        // rounding safely
        const principalAmount = Number(principalPerDue.toFixed(2));
        const interestAmount = Number(interestPerDue.toFixed(2));
        const dueAmount = Number((principalAmount + interestAmount).toFixed(2));

        const due: Due = {
          loanId,
          customerId,

          principalAmount,
          interestAmount,
          dueAmount,

          type: EDueType.UPCOMING_DUE,
          dueDate,
          createdBy,
        };
        console.log(due);
        dues.push(due);
      }

      // ⚠️ Adjust rounding drift on last due
      this.fixRoundingDrift(dues, amountRemaining, interestRemaining);

      if (dues.length > 0) {
        await this.duesRepo.bulkCreate(dues);
      }
    } catch (err) {
      throw err;
    }
  }

  private fixRoundingDrift(dues: Due[], totalPrincipal: number, totalInterest: number) {
    const principalSum = dues.reduce((sum, d) => sum + d.principalAmount, 0);
    const interestSum = dues.reduce((sum, d) => sum + d.interestAmount, 0);

    const principalDiff = Number((totalPrincipal - principalSum).toFixed(2));
    const interestDiff = Number((totalInterest - interestSum).toFixed(2));

    const lastDue = dues[dues.length - 1];

    lastDue.principalAmount = Number((lastDue.principalAmount + principalDiff).toFixed(2));

    lastDue.interestAmount = Number((lastDue.interestAmount + interestDiff).toFixed(2));

    lastDue.dueAmount = Number((lastDue.principalAmount + lastDue.interestAmount).toFixed(2));
  }

  private calculateNumberOfDues(interestType: EInterestType, tenureType: ELoanTenureType, tenureValue: number): number {
    // If interest type matches tenure type, use tenure value directly
    if (
      (interestType === EInterestType.MONTHLY && tenureType === ELoanTenureType.MONTHS) ||
      (interestType === EInterestType.DAILY && tenureType === ELoanTenureType.DAYS)
    ) {
      return tenureValue;
    }

    // Convert tenure to match interest type
    if (interestType === EInterestType.MONTHLY) {
      if (tenureType === ELoanTenureType.DAYS) {
        // Convert days to months (approximate: 30 days = 1 month)
        return Math.ceil(tenureValue / 30);
      } else if (tenureType === ELoanTenureType.YEARS) {
        // Convert years to months
        return tenureValue * 12;
      }
    } else if (interestType === EInterestType.DAILY) {
      if (tenureType === ELoanTenureType.MONTHS) {
        // Convert months to days (approximate: 1 month = 30 days)
        return tenureValue * 30;
      } else if (tenureType === ELoanTenureType.YEARS) {
        // Convert years to days (approximate: 1 year = 365 days)
        return tenureValue * 365;
      }
    }

    // Default fallback
    return tenureValue;
  }

  private calculateDueDate(startDate: Date, interestType: EInterestType, periodNumber: number): Date {
    const dueDate = new Date(startDate);

    if (interestType === EInterestType.MONTHLY) {
      // Add months for monthly interest
      dueDate.setMonth(dueDate.getMonth() + periodNumber);
    } else if (interestType === EInterestType.DAILY) {
      // Add days for daily interest
      dueDate.setDate(dueDate.getDate() + periodNumber);
    }

    return dueDate;
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

  async getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats> {
    try {
      filterOptions.startDate = filterOptions.startDate;
      filterOptions.endDate = filterOptions.endDate;
      filterOptions.startDate.setHours(0, 0, 0, 0);
      filterOptions.endDate.setHours(23, 59, 59, 999);
      const stats = await this.loansRepo.getStats(userId, filterOptions);
      return stats;
    } catch (err) {
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
