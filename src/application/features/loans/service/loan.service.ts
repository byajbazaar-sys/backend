import { Inject, Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Loan, LoanExtended, LoanItem, LoanStats } from '../domain';
import { ILoansRepository, LOANS_REPOSITORY } from './i-loans.repository';
import { ILoanService } from './i-loan.service';
import { LoansFilterOptions, LoanStatsFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { ILoanItemsRepository, LOAN_ITEMS_REPOSITORY } from './i-loan-items.repository';
import { DUES_REPOSITORY, EDueType, IDuesRepository, IUsersFileStorage, USERS_FILE_STORAGE } from '../../../shared';
import { Due } from '../../transactions';
import { EInterestCalculationMethod, EInterestType, ELoanTenureType, ELoanStatus } from '../enums';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class LoanService implements ILoanService {
  constructor(
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(LOAN_ITEMS_REPOSITORY) private readonly loanItemsRepo: ILoanItemsRepository,
    @Inject(USERS_FILE_STORAGE) private readonly loansFileStorage: IUsersFileStorage,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    @InjectPinoLogger(LoanService.name) private readonly logger: PinoLogger,
  ) { }

  async create(data: Loan): Promise<Loan> {
    try {
      this.logger.info({ customerId: data.customerId, amountRemaining: data.amountRemaining }, 'Creating new loan');

      // Ensure all values are numbers
      const amountRemaining = Number(data.amountRemaining);
      const interestPercentage = Number(data.interestPercentage);
      const tenureValue = Number(data.tenureValue);

      // Validate that all required values are valid numbers
      if (
        isNaN(amountRemaining) ||
        isNaN(interestPercentage) ||
        isNaN(tenureValue) ||
        amountRemaining < 0 ||
        interestPercentage < 0 ||
        tenureValue < 0
      ) {
        this.logger.error(
          { amountRemaining, interestPercentage, tenureValue, interestCalculationMethod: data.interestCalculationMethod },
          'Invalid values for interest calculation',
        );
        throw new BadRequestException('Invalid loan parameters for interest calculation');
      }

      if (data.interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
        data.interestRemaining =
          (interestPercentage * amountRemaining * (1 + interestPercentage / 100) ** tenureValue) / 100;
      } else {
        data.interestRemaining = (interestPercentage * amountRemaining * tenureValue) / 100;
      }

      // Ensure interestRemaining is a valid number
      if (isNaN(data.interestRemaining) || !isFinite(data.interestRemaining)) {
        this.logger.error(
          { amountRemaining, interestPercentage, tenureValue, interestCalculationMethod: data.interestCalculationMethod, calculatedInterest: data.interestRemaining },
          'Calculated interest is NaN or infinite',
        );
        throw new BadRequestException('Invalid interest calculation result');
      }

      const loan = await this.loansRepo.create(data);
      this.logger.debug({ loanId: loan.id }, 'Loan created, processing loan items');

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

      this.logger.info({ loanId: loan.id }, 'Loan created successfully with dues');
      return { ...loan, loanItems: data.loanItems };
    } catch (err) {
      this.logger.error({ err, customerId: data.customerId }, 'Error creating loan');
      throw err;
    }
  }

  private async createDuesForLoan(
    loan: Loan,
    options?: {
      startDate?: Date;
      remainingAmount?: number;
      remainingInterest?: number;
      remainingTenure?: number;
    },
  ): Promise<void> {
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

      // Use provided options or defaults
      const startDate = options?.startDate || (createdAt ? new Date(createdAt) : new Date());
      const remainingAmount = options?.remainingAmount ?? amountRemaining;
      const remainingInterest = options?.remainingInterest ?? interestRemaining;
      const remainingTenure = options?.remainingTenure ?? tenureValue;

      const numberOfDues = this.calculateNumberOfDues(interestType, tenureType, remainingTenure);

      if (numberOfDues <= 0) {
        throw new Error('Invalid number of dues calculated');
      }

      // ✅ Split principal and interest separately
      const principalPerDue = remainingAmount / numberOfDues;
      const interestPerDue = remainingInterest / numberOfDues;

      const dues: Due[] = [];

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
        dues.push(due);
      }

      // ⚠️ Adjust rounding drift on last due
      this.fixRoundingDrift(dues, remainingAmount, remainingInterest);

      if (dues.length > 0) {
        await this.duesRepo.bulkCreate(dues);
        this.logger.debug({ loanId, numberOfDues: dues.length }, 'Dues created successfully');
      }
    } catch (err) {
      this.logger.error({ err }, 'Error creating dues for loan');
      throw err;
    }
  }

  async getById(id: string, createdBy: string): Promise<Loan> {
    try {
      this.logger.debug({ loanId: id, createdBy }, 'Getting loan by ID');
      const loan = await this.loansRepo.findById(id, createdBy);
      if (!loan) {
        this.logger.warn({ loanId: id, createdBy }, 'Loan not found');
        throw new NotFoundException('Loan not found');
      }
      return loan;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, loanId: id, createdBy }, 'Error getting loan by ID');
      throw err;
    }
  }

  async getLoans(params: LoansFilterOptions): Promise<LoanExtended> {
    try {
      // Default to open loans if status not specified
      if (!params.status) {
        params.status = ELoanStatus.OPEN;
      }
      this.logger.debug({ createdBy: params.createdBy, status: params.status }, 'Getting loans');
      const result = await this.loansRepo.listLoans(params);
      console.log("result", result)
      return result;
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting loans');
      throw err;
    }
  }

  async updateStatus(id: string, status: ELoanStatus, createdBy: string): Promise<Loan> {
    try {
      this.logger.info({ loanId: id, status, createdBy }, 'Updating loan status');
      const existingLoan = await this.loansRepo.findById(id, createdBy);
      if (!existingLoan) {
        this.logger.warn({ loanId: id, createdBy }, 'Loan not found for status update');
        throw new NotFoundException('Loan not found');
      }

      // Validate status transition
      if (status === ELoanStatus.CLOSED && existingLoan.status === ELoanStatus.CLOSED) {
        this.logger.warn({ loanId: id }, 'Attempted to close already closed loan');
        throw new BadRequestException('Loan is already closed');
      }

      if (status === ELoanStatus.OPEN && existingLoan.status === ELoanStatus.OPEN) {
        this.logger.warn({ loanId: id }, 'Attempted to open already open loan');
        throw new BadRequestException('Loan is already open');
      }

      // Update loan status
      const updatedLoan = await this.loansRepo.update(id, {
        status,
        createdBy,
      } as Loan);

      if (!updatedLoan) {
        throw new NotFoundException('Loan not found');
      }

      this.logger.info({ loanId: id, oldStatus: existingLoan.status, newStatus: status }, 'Loan status updated successfully');
      return updatedLoan;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error({ err, loanId: id, status, createdBy }, 'Error updating loan status');
      throw err;
    }
  }

  async updateLoanItem(loanId: string, itemId: string, updateData: Partial<LoanItem>, createdBy: string): Promise<LoanItem> {
    try {
      this.logger.info({ loanId, itemId, createdBy }, 'Updating loan item');

      // Validate loan exists and is not closed
      const existingLoan = await this.loansRepo.findById(loanId, createdBy);
      if (!existingLoan) {
        this.logger.warn({ loanId, createdBy }, 'Loan not found for loan item update');
        throw new NotFoundException('Loan not found');
      }

      if (existingLoan.status === ELoanStatus.CLOSED) {
        this.logger.warn({ loanId }, 'Attempted to update loan item in closed loan');
        throw new BadRequestException('Cannot update loan item in a closed loan');
      }

      // Validate loan item exists
      const existingLoanItem = await this.loanItemsRepo.findById(itemId, loanId);
      if (!existingLoanItem) {
        this.logger.warn({ loanId, itemId }, 'Loan item not found');
        throw new NotFoundException('Loan item not found');
      }

      // Handle image update if provided
      if (updateData.image) {
        const fileExtension = updateData.image.mimetype.split('/')[1];
        updateData.imageRef = `loans/items/${loanId}/${itemId}.${fileExtension}`;
        await this.loansFileStorage.writeAsync(updateData.imageRef, updateData.image.buffer, updateData.image.mimetype);
      }

      // Update the loan item
      const updatedLoanItem = await this.loanItemsRepo.update(itemId, loanId, updateData);
      if (!updatedLoanItem) {
        throw new NotFoundException('Loan item not found');
      }

      // Calculate the difference in the specific loan item amount
      const oldItemAmount = existingLoanItem.amount;
      const newItemAmount = updateData.amount ?? existingLoanItem.amount;
      const itemAmountDifference = newItemAmount - oldItemAmount;

      // Calculate original total loan amount (sum of all original loan items before update)
      // This represents the loan amount before any payments or top-ups
      // Formula: originalTotal = amountRemaining + amountPaid
      // Note: This assumes no top-ups. If top-ups exist, they're already reflected in amountRemaining
      const originalTotalLoanAmount = existingLoan.amountRemaining + existingLoan.amountPaid;

      // New total loan amount after item update
      const newTotalLoanAmount = originalTotalLoanAmount + itemAmountDifference;

      // New amount remaining = new total - amount already paid
      // This preserves the payment history
      const newAmountRemaining = newTotalLoanAmount - existingLoan.amountPaid;

      // Ensure amount remaining doesn't go negative
      if (newAmountRemaining < 0) {
        this.logger.warn({ loanId, newAmountRemaining, amountPaid: existingLoan.amountPaid }, 'New loan amount would be less than amount paid');
        throw new BadRequestException('Cannot update loan item: new loan amount would be less than amount already paid');
      }

      // Update loan with new amount
      const updatedLoanData: Loan = {
        ...existingLoan,
        amountRemaining: newAmountRemaining,
      };

      // Recalculate interest based on new amount
      // Ensure all values are numbers
      const amountRemaining = Number(updatedLoanData.amountRemaining);
      const interestPercentage = Number(existingLoan.interestPercentage);
      const tenureValue = Number(existingLoan.tenureValue);

      // Validate that all required values are valid numbers
      if (
        isNaN(amountRemaining) ||
        isNaN(interestPercentage) ||
        isNaN(tenureValue) ||
        amountRemaining < 0 ||
        interestPercentage < 0 ||
        tenureValue < 0
      ) {
        this.logger.error(
          { amountRemaining, interestPercentage, tenureValue, interestCalculationMethod: existingLoan.interestCalculationMethod },
          'Invalid values for interest calculation in updateLoanItem',
        );
        throw new BadRequestException('Invalid loan parameters for interest calculation');
      }

      if (existingLoan.interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
        updatedLoanData.interestRemaining =
          (interestPercentage * amountRemaining * (1 + interestPercentage / 100) ** tenureValue) / 100;
      } else {
        updatedLoanData.interestRemaining = (interestPercentage * amountRemaining * tenureValue) / 100;
      }

      // Ensure interestRemaining is a valid number
      if (isNaN(updatedLoanData.interestRemaining) || !isFinite(updatedLoanData.interestRemaining)) {
        this.logger.error(
          { amountRemaining, interestPercentage, tenureValue, interestCalculationMethod: existingLoan.interestCalculationMethod, calculatedInterest: updatedLoanData.interestRemaining },
          'Calculated interest is NaN or infinite in updateLoanItem',
        );
        throw new BadRequestException('Invalid interest calculation result');
      }

      // Update the loan
      await this.loansRepo.update(loanId, updatedLoanData);

      // Recalculate dues (preserving paid dues)
      this.logger.info({ loanId }, 'Recalculating dues after loan item update');
      const paidDues = await this.duesRepo.findByLoanIdAndType(loanId, [EDueType.PAID]);
      const paidDuesCount = paidDues.length;

      // Calculate remaining amounts from the updated loan
      const remainingAmount = updatedLoanData.amountRemaining;
      const remainingInterest = updatedLoanData.interestRemaining;

      // Calculate remaining tenure
      const totalTenure = existingLoan.tenureValue;
      const remainingTenure = totalTenure - paidDuesCount;

      // Find the next unpaid due date
      let startDate: Date;
      if (paidDues.length > 0) {
        const lastPaidDue = paidDues[paidDues.length - 1];
        startDate = new Date(lastPaidDue.dueDate);
        if (existingLoan.interestType === EInterestType.MONTHLY) {
          startDate.setMonth(startDate.getMonth() + 1);
        } else if (existingLoan.interestType === EInterestType.DAILY) {
          startDate.setDate(startDate.getDate() + 1);
        }
      } else {
        startDate = existingLoan.createdAt ? new Date(existingLoan.createdAt) : new Date();
      }
      startDate.setHours(0, 0, 0, 0);

      // Delete only UPCOMING_DUE and PAST_DUE dues (keep PAID dues)
      await this.duesRepo.deleteByLoanId(loanId, [EDueType.UPCOMING_DUE, EDueType.PAST_DUE]);

      // Recreate dues with updated loan data
      if (remainingTenure > 0 && remainingAmount > 0) {
        const loanForDues: Loan = {
          ...updatedLoanData,
          interestType: existingLoan.interestType,
          tenureType: existingLoan.tenureType,
          tenureValue: remainingTenure,
          amountRemaining: remainingAmount,
          interestRemaining: remainingInterest,
          customerId: existingLoan.customerId,
          createdAt: startDate,
        };

        await this.createDuesForLoan(loanForDues, {
          startDate,
          remainingAmount,
          remainingInterest,
          remainingTenure,
        });
        this.logger.info({ loanId, remainingTenure, paidDuesCount }, 'Dues recalculated successfully after loan item update');
      }

      this.logger.info({ loanId, itemId }, 'Loan item updated successfully');
      return updatedLoanItem;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error({ err, loanId, itemId, createdBy }, 'Error updating loan item');
      throw err;
    }
  }

  async getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats> {
    try {
      this.logger.debug({ userId, filterOptions }, 'Getting loan stats');
      filterOptions.startDate.setHours(0, 0, 0, 0);
      filterOptions.endDate.setHours(23, 59, 59, 999);
      const stats = await this.loansRepo.getStats(userId, filterOptions);
      return stats;
    } catch (err) {
      this.logger.error({ err, userId, filterOptions }, 'Error getting loan stats');
      throw err;
    }
  }

  async update(id: string, updateData: Loan): Promise<Loan> {
    try {
      this.logger.info({ loanId: id, createdBy: updateData.createdBy }, 'Updating loan');
      const existingLoan = await this.loansRepo.findById(id, updateData.createdBy);
      if (!existingLoan) {
        this.logger.warn({ loanId: id, createdBy: updateData.createdBy }, 'Loan not found for update');
        throw new NotFoundException('Loan not found');
      }

      // Prevent updating closed loans
      if (existingLoan.status === ELoanStatus.CLOSED) {
        this.logger.warn({ loanId: id }, 'Attempted to update closed loan');
        throw new BadRequestException('Cannot update a closed loan');
      }

      // Prevent status updates through regular update endpoint (use updateStatus instead)
      if (updateData.status && updateData.status !== existingLoan.status) {
        this.logger.warn({ loanId: id }, 'Attempted to update status through regular update endpoint');
        throw new BadRequestException('Cannot update loan status through this endpoint. Use PATCH /loans/:id/status instead');
      }

      // Check if fields that affect dues calculation have changed
      const duesNeedRecalculation =
        !!updateData.tenureType ||
        !!updateData.tenureValue ||
        !!updateData.interestType ||
        !!updateData.interestPercentage ||
        !!updateData.interestCalculationMethod ||
        !!updateData.amountRemaining;

      // Merge update data with existing loan data to get final values
      // Exclude status from updateData to prevent status changes through this endpoint
      const { status, ...updateDataWithoutStatus } = updateData;
      const finalLoanData: Loan = {
        ...existingLoan,
        ...updateDataWithoutStatus,
        _id: existingLoan._id,
        id: existingLoan.id,
        customerId: updateData.customerId ?? existingLoan.customerId,
        createdBy: existingLoan.createdBy,
        createdAt: existingLoan.createdAt,
        status: existingLoan.status, // Always preserve existing status
      };

      // Recalculate interest if interest-related fields are being updated
      if (
        updateData.interestCalculationMethod ||
        updateData.interestPercentage ||
        updateData.tenureValue ||
        updateData.amountRemaining ||
        updateData.interestType
      ) {
        // Use update values if provided, otherwise use existing values
        const amountRemaining = Number(updateData.amountRemaining ?? existingLoan.amountRemaining);
        const interestPercentage = Number(updateData.interestPercentage ?? existingLoan.interestPercentage);
        const tenureValue = Number(updateData.tenureValue ?? existingLoan.tenureValue);
        const interestCalculationMethod = updateData.interestCalculationMethod ?? existingLoan.interestCalculationMethod;

        // Validate that all required values are valid numbers
        if (
          isNaN(amountRemaining) ||
          isNaN(interestPercentage) ||
          isNaN(tenureValue) ||
          amountRemaining < 0 ||
          interestPercentage < 0 ||
          tenureValue < 0
        ) {
          this.logger.error(
            { amountRemaining, interestPercentage, tenureValue, interestCalculationMethod },
            'Invalid values for interest calculation',
          );
          throw new BadRequestException('Invalid loan parameters for interest calculation');
        }

        if (interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
          finalLoanData.interestRemaining =
            (interestPercentage * amountRemaining * (1 + interestPercentage / 100) ** tenureValue) / 100;
        } else {
          finalLoanData.interestRemaining = (interestPercentage * amountRemaining * tenureValue) / 100;
        }

        // Ensure interestRemaining is a valid number
        if (isNaN(finalLoanData.interestRemaining) || !isFinite(finalLoanData.interestRemaining)) {
          this.logger.error(
            { amountRemaining, interestPercentage, tenureValue, interestCalculationMethod, calculatedInterest: finalLoanData.interestRemaining },
            'Calculated interest is NaN or infinite',
          );
          throw new BadRequestException('Invalid interest calculation result');
        }
      } else {
        // Keep existing interest remaining if not recalculating
        finalLoanData.interestRemaining = existingLoan.interestRemaining;
      }

      // Update the loan first
      const updatedLoan = await this.loansRepo.update(id, finalLoanData);

      // If dues need recalculation, delete existing upcoming and past dues, then recreate
      if (duesNeedRecalculation) {
        this.logger.info({ loanId: id }, 'Recalculating dues for updated loan');
        // Get all paid dues to calculate remaining amounts and tenure
        const paidDues = await this.duesRepo.findByLoanIdAndType(id, [EDueType.PAID]);

        // Calculate how many dues have been paid
        const paidDuesCount = paidDues.length;

        // Calculate remaining amounts from the loan (already updated with transactions)
        const remainingAmount = updatedLoan.amountRemaining;
        const remainingInterest = updatedLoan.interestRemaining;

        // Calculate remaining tenure
        // Use the updated tenure value (which might have changed)
        const totalTenure = finalLoanData.tenureValue;
        const remainingTenure = Math.max(0, totalTenure - paidDuesCount);

        // Only recreate dues if there's remaining tenure
        if (remainingTenure > 0 && (remainingAmount > 0 || remainingInterest > 0)) {
          // Find the next unpaid due date
          // If there are paid dues, start from the day after the last paid due
          // Otherwise, start from the original creation date
          let startDate: Date;
          if (paidDues.length > 0) {
            // Get the last paid due date and add one period
            const lastPaidDue = paidDues[paidDues.length - 1];
            startDate = new Date(lastPaidDue.dueDate);
            // Add one period based on updated interest type
            if (finalLoanData.interestType === EInterestType.MONTHLY) {
              startDate.setMonth(startDate.getMonth() + 1);
            } else if (finalLoanData.interestType === EInterestType.DAILY) {
              startDate.setDate(startDate.getDate() + 1);
            }
          } else {
            // No paid dues, start from original creation date
            startDate = existingLoan.createdAt ? new Date(existingLoan.createdAt) : new Date();
          }

          // Delete only UPCOMING_DUE and PAST_DUE dues (keep PAID dues as they have transactions)
          await this.duesRepo.deleteByLoanId(id, [EDueType.UPCOMING_DUE, EDueType.PAST_DUE]);

          // Recreate dues with updated loan data, but only for remaining tenure
          // Use the updated loan data merged with existing values
          const loanForDues: Loan = {
            ...updatedLoan,
            interestType: finalLoanData.interestType,
            tenureType: finalLoanData.tenureType,
            tenureValue: remainingTenure, // Use remaining tenure
            amountRemaining: remainingAmount, // Use remaining amount from loan
            interestRemaining: remainingInterest, // Use remaining interest from loan
            customerId: finalLoanData.customerId,
            createdAt: startDate, // Use calculated start date
          };

          // Create dues starting from the next unpaid due date with remaining amounts and tenure
          await this.createDuesForLoan(loanForDues, {
            startDate,
            remainingAmount,
            remainingInterest,
            remainingTenure,
          });
          this.logger.info({ loanId: id, remainingTenure, paidDuesCount }, 'Dues recalculated successfully');
        } else {
          // No remaining tenure or amounts, just delete upcoming and past dues
          await this.duesRepo.deleteByLoanId(id, [EDueType.UPCOMING_DUE, EDueType.PAST_DUE]);
          this.logger.info({ loanId: id }, 'All dues paid, removed upcoming and past dues');
        }
      }

      this.logger.info({ loanId: id }, 'Loan updated successfully');
      return updatedLoan;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ForbiddenException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error({ err, loanId: id }, 'Error updating loan');
      throw err;
    }
  }

  async delete(id: string, createdBy: string): Promise<void> {
    try {
      this.logger.info({ loanId: id, createdBy }, 'Deleting loan');
      const existingLoan = await this.loansRepo.findById(id, createdBy);
      if (!existingLoan) {
        this.logger.warn({ loanId: id, createdBy }, 'Loan not found for deletion');
        throw new NotFoundException('Loan not found');
      }

      await this.loansRepo.delete(id, createdBy);
      this.logger.info({ loanId: id }, 'Loan deleted successfully');
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, loanId: id, createdBy }, 'Error deleting loan');
      throw err;
    }
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
}
