import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { assertLoanVersion, Loan, LoanExtended, LoanItem, LoanStats, LoanBaselineData } from '../domain';
import { UpdateLoanItemPatch } from '../models';
import { ILoanService } from './i-loan.service';
import { ILoansRepository, LOANS_REPOSITORY } from './i-loans.repository';
import { LoansFilterOptions, LoansDownloadFilterOptions, LoanStatsFilterOptions } from '../options';
import { ILoanItemsRepository, LOAN_ITEMS_REPOSITORY } from './i-loan-items.repository';
import {
  DUES_REPOSITORY,
  EDueType,
  IDuesRepository,
  IUsersFileStorage,
  USERS_FILE_STORAGE,
  IItemsRepository,
  ITEMS_REPOSITORY,
  Due,
  ITransactionsRepository,
  TRANSACTIONS_REPOSITORY,
  IUnitOfWork,
  UNIT_OF_WORK,
  CACHE_NAMESPACE,
  CACHE_SERVICE,
  DASHBOARD_CACHE_TTL_SECONDS,
  ICacheService,
  loanStatsCacheParts,
} from '../../../shared';
import {
  EInterestCalculationMethod,
  EInterestType,
  ELoanTenureType,
  ELoanStatus,
  EInterestPrincipalBasis,
} from '../enums';

/** Unpaid due types replaced when recalculating a loan schedule. */
const UNPAID_DUE_TYPES = [EDueType.UPCOMING_DUE, EDueType.PAST_DUE, EDueType.OVERDUE];

@Injectable()
export class LoanService implements ILoanService {
  constructor(
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(LOAN_ITEMS_REPOSITORY) private readonly loanItemsRepo: ILoanItemsRepository,
    @Inject(USERS_FILE_STORAGE) private readonly loansFileStorage: IUsersFileStorage,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactionsRepo: ITransactionsRepository,
    @Inject(ITEMS_REPOSITORY) private readonly itemsRepo: IItemsRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @InjectPinoLogger(LoanService.name) private readonly logger: PinoLogger,
  ) {}

  private isStorageKey(value: string): boolean {
    return !!value && !value.startsWith('http');
  }

  private async enrichLoanItemsWithImageUrls(items: LoanItem[]): Promise<void> {
    if (!items?.length) return;
    await Promise.all(
      items.map(async (item) => {
        if (item.imageRef) {
          const url = await this.loansFileStorage.getUrlAsync(item.imageRef);
          if (url) item.imageRef = url;
        }
      }),
    );
  }

  private async enrichLoanWithVoucherSignatureUrls(loan: Loan): Promise<void> {
    if (loan.signatureRef && this.isStorageKey(loan.signatureRef)) {
      const url = await this.loansFileStorage.getUrlAsync(loan.signatureRef);
      if (url) loan.signatureRef = url;
    }
    if (loan.fingerprintRef && this.isStorageKey(loan.fingerprintRef)) {
      const url = await this.loansFileStorage.getUrlAsync(loan.fingerprintRef);
      if (url) loan.fingerprintRef = url;
    }
  }

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
          {
            amountRemaining,
            interestPercentage,
            tenureValue,
            interestCalculationMethod: data.interestCalculationMethod,
          },
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
          {
            amountRemaining,
            interestPercentage,
            tenureValue,
            interestCalculationMethod: data.interestCalculationMethod,
            calculatedInterest: data.interestRemaining,
          },
          'Calculated interest is NaN or infinite',
        );
        throw new BadRequestException('Invalid interest calculation result');
      }
      // Origination is the first replay checkpoint; no transactions exist yet.
      data.baselineAmountRemaining = amountRemaining;
      data.baselineAmountPaid = Number(data.amountPaid ?? 0);
      data.baselineInterestRemaining = Number(data.interestRemaining);
      data.baselineInterestPaid = Number(data.interestPaid ?? 0);
      data.baselineSeq = 0;

      const loan = await this.loansRepo.create(data);
      this.logger.debug({ loanId: loan.id }, 'Loan created, processing loan items');

      for (const loanItem of data.loanItems) {
        if (loanItem.image) {
          const normalized = await normalizeImageBufferForStorageOrThrow(
            loanItem.image.buffer,
            loanItem.image.mimetype,
            loanItem.image.originalname,
          );
          const proposedRef = `loans/items/${loan.id}/${loanItem.id}.${normalized.fileExtension}`;
          // Persist S3 key returned by writeAsync (extension may be corrected from buffer sniffing)
          loanItem.imageRef = await this.loansFileStorage.writeAsync(
            proposedRef,
            normalized.buffer,
            normalized.mimetype,
          );
        }
      }
      await this.loanItemsRepo.bulkInsert(data.loanItems);

      // Prefer explicit start date (stored as createdAt). CreateDateColumn may overwrite on insert,
      // so re-apply and pass it into dues so schedules match the selected issue date.
      const startDateOverride = data.createdAt ? this.startOfDay(new Date(data.createdAt)) : undefined;
      if (startDateOverride && loan.id) {
        const updated = await this.loansRepo.update(loan.id, {
          createdAt: startDateOverride,
          createdBy: loan.createdBy,
        } as Loan);
        if (updated) {
          loan.createdAt = updated.createdAt ?? startDateOverride;
        } else {
          loan.createdAt = startDateOverride;
        }
      }

      await this.createDuesForLoan(
        {
          ...data,
          id: loan.id,
          createdBy: loan.createdBy,
          customerId: loan.customerId ?? data.customerId,
          createdAt: loan.createdAt ?? startDateOverride,
          amountRemaining: Number(data.amountRemaining),
          interestRemaining: Number(data.interestRemaining),
          tenureValue: Number(data.tenureValue),
          tenureType: data.tenureType,
          interestType: data.interestType,
          interestCalculationMethod: data.interestCalculationMethod,
          interestPercentage: Number(data.interestPercentage),
        },
        startDateOverride ? { startDate: startDateOverride } : undefined,
      );

      this.logger.info({ loanId: loan.id }, 'Loan created successfully with dues');
      await this.enrichLoanItemsWithImageUrls(data.loanItems);
      await this.enrichLoanWithVoucherSignatureUrls(loan);
      await this.invalidateLoanStatsCache(loan.createdBy);
      return { ...loan, loanItems: data.loanItems };
    } catch (err) {
      this.logger.error({ err, customerId: data.customerId }, 'Error creating loan');
      throw err;
    }
  }

  /**
   * Build unpaid dues for a loan using the same logic as createDuesForLoan,
   * without persisting them (caller persists inside a transaction when needed).
   */
  private buildDuesForLoan(
    loan: Loan,
    options?: {
      startDate?: Date;
      remainingAmount?: number;
      remainingInterest?: number;
      remainingTenure?: number;
      duePeriodCount?: number;
    },
  ): Due[] {
    const {
      interestType,
      tenureType,
      tenureValue,
      amountRemaining,
      interestRemaining,
      customerId,
      createdBy,
      createdAt,
    } = loan;

    const loanId = loan.id;
    if (!loanId) throw new Error('Loan ID is required');
    if (!customerId || !createdBy) {
      throw new Error('Customer ID and Created By are required');
    }

    const startDate = this.startOfDay(options?.startDate ?? (createdAt ? new Date(createdAt) : new Date()));
    const remainingAmount = Number(options?.remainingAmount ?? amountRemaining);
    const remainingInterest = Number(options?.remainingInterest ?? interestRemaining);
    const remainingTenure = Number(options?.remainingTenure ?? tenureValue);

    if (
      !Number.isFinite(remainingAmount) ||
      !Number.isFinite(remainingInterest) ||
      !Number.isFinite(remainingTenure) ||
      remainingTenure <= 0
    ) {
      throw new BadRequestException('Invalid loan balances for due schedule calculation');
    }

    const numberOfDues =
      options?.duePeriodCount ?? this.calculateNumberOfDues(interestType, tenureType, remainingTenure);
    if (numberOfDues <= 0) {
      throw new Error('Invalid number of dues calculated');
    }

    const principalPerDue = remainingAmount / numberOfDues;
    const interestPerDue = remainingInterest / numberOfDues;
    const dues: Due[] = [];

    for (let i = 0; i < numberOfDues; i++) {
      const dueDate = this.calculateDueDate(startDate, interestType, i + 1);
      const principalAmount = Number(principalPerDue.toFixed(2));
      const interestAmount = Number(interestPerDue.toFixed(2));
      const dueAmount = Number((principalAmount + interestAmount).toFixed(2));

      dues.push({
        loanId,
        customerId,
        principalAmount,
        interestAmount,
        dueAmount,
        type: EDueType.UPCOMING_DUE,
        dueDate,
        createdBy,
      });
    }

    this.fixRoundingDrift(dues, remainingAmount, remainingInterest);
    return dues;
  }

  private async createDuesForLoan(
    loan: Loan,
    options?: {
      startDate?: Date;
      remainingAmount?: number;
      remainingInterest?: number;
      remainingTenure?: number;
      duePeriodCount?: number;
    },
  ): Promise<void> {
    try {
      const dues = this.buildDuesForLoan(loan, options);
      if (dues.length > 0) {
        await this.duesRepo.bulkCreate(dues);
        this.logger.debug({ loanId: loan.id, numberOfDues: dues.length }, 'Dues created successfully');
      }
    } catch (err) {
      this.logger.error({ err }, 'Error creating dues for loan');
      throw err;
    }
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Number of due periods between an earlier start and a later start,
   * using the same frequency logic as createDuesForLoan / calculateDueDate.
   */
  private countDuePeriodsBetween(earlierStart: Date, laterStart: Date, interestType: EInterestType): number {
    const earlier = this.startOfDay(earlierStart);
    const laterMs = this.startOfDay(laterStart).getTime();
    if (earlier.getTime() >= laterMs) {
      return 0;
    }

    let periods = 0;
    // Safety bound: avoid infinite loops on bad dates
    while (periods < 10000) {
      periods += 1;
      const cursor = this.calculateDueDate(earlier, interestType, periods);
      if (this.startOfDay(cursor).getTime() >= laterMs) {
        return periods;
      }
    }
    return periods;
  }

  private assertStartDateUpdateAllowed(
    existingLoan: Loan,
    currentStartDate: Date,
    newStartDate: Date,
    interestType: EInterestType,
    allDues: Due[],
  ): void {
    const current = this.startOfDay(currentStartDate).getTime();
    const next = this.startOfDay(newStartDate).getTime();

    if (next === current) {
      return;
    }

    const paidDues = allDues.filter((due) => due.type === EDueType.PAID);
    const unpaidDues = allDues.filter((due) => due.type !== EDueType.PAID);
    const interestPaid = Number(existingLoan.interestPaid ?? 0);
    const amountPaid = Number(existingLoan.amountPaid ?? 0);

    // Interest / principal / top-up payments redistribute remaining balances without marking dues PAID.
    if (paidDues.length === 0 && (interestPaid > 0 || amountPaid > 0)) {
      throw new BadRequestException('Loan start date cannot be changed after interest, principal, or top-up payments.');
    }

    // Fully paid loans cannot have their start date moved
    if (allDues.length > 0 && unpaidDues.length === 0) {
      throw new BadRequestException(
        'Loan start date cannot be moved earlier because it would make the existing paid dues inconsistent.',
      );
    }

    // Moving start date later: reject if any paid due falls before the new start date
    if (next > current) {
      const hasPaidDueBeforeNewStart = paidDues.some((due) => this.startOfDay(new Date(due.dueDate)).getTime() < next);
      if (hasPaidDueBeforeNewStart) {
        throw new BadRequestException('Loan start date cannot be moved after existing paid dues.');
      }
      return;
    }

    // Moving start date earlier: N new dues would be prepended based on frequency
    const newDuesAtBeginning = this.countDuePeriodsBetween(newStartDate, currentStartDate, interestType);
    if (newDuesAtBeginning <= 0) {
      return;
    }

    // Sorted ascending by due date — last N are the trailing dues of the current schedule
    const sortedDues = [...allDues].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const lastNDues = sortedDues.slice(-newDuesAtBeginning);
    const lastNHasPaid = lastNDues.some((due) => due.type === EDueType.PAID);
    if (lastNHasPaid) {
      throw new BadRequestException(
        'Loan start date cannot be moved earlier because it would make the existing paid dues inconsistent.',
      );
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
      await this.enrichLoanItemsWithImageUrls(loan.loanItems ?? []);
      await this.enrichLoanWithVoucherSignatureUrls(loan);
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
      return this.loansRepo.listLoans(params);
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting loans');
      throw err;
    }
  }

  async getLoansForDownload(params: LoansDownloadFilterOptions): Promise<Loan[]> {
    try {
      this.logger.debug({ createdBy: params.createdBy }, 'Getting loans for download');
      return this.loansRepo.listAllLoans(params);
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting loans for download');
      throw err;
    }
  }

  async closeOpenLoansPastTenure(): Promise<number> {
    try {
      const toClose = await this.loansRepo.findOpenLoanIdsPastMaturity();
      let closedCount = 0;
      for (const { id, createdBy } of toClose) {
        try {
          await this.updateStatus(id, ELoanStatus.CLOSED, createdBy);
          closedCount += 1;
        } catch (err) {
          this.logger.warn(
            { err, loanId: id, createdBy },
            'Skipping loan when closing past tenure (e.g. already closed or not found)',
          );
        }
      }
      this.logger.info({ closedCount, candidates: toClose.length }, 'Closed open loans past tenure (cron)');
      return closedCount;
    } catch (err) {
      this.logger.error({ err }, 'Error closing open loans past tenure');
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

      const closedAt = status === ELoanStatus.CLOSED ? new Date() : null;

      // Update loan status and closed-at timestamp
      const updatedLoan = await this.loansRepo.update(id, {
        status,
        createdBy,
        closedAt,
      } as Loan);

      if (!updatedLoan) {
        throw new NotFoundException('Loan not found');
      }

      this.logger.info(
        { loanId: id, oldStatus: existingLoan.status, newStatus: status },
        'Loan status updated successfully',
      );
      await this.invalidateLoanStatsCache(createdBy);
      return updatedLoan;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error({ err, loanId: id, status, createdBy }, 'Error updating loan status');
      throw err;
    }
  }

  async updateLoanItem(itemId: string, updateData: LoanItem, createdBy: string): Promise<LoanItem> {
    try {
      this.logger.info({ itemId, createdBy }, 'Updating loan item');

      const existingLoanItem = await this.loanItemsRepo.findByIdOnly(itemId);
      if (!existingLoanItem) {
        this.logger.warn({ itemId }, 'Loan item not found');
        throw new NotFoundException('Loan item not found');
      }

      const loanId = existingLoanItem.loanId;

      const existingLoan = await this.loansRepo.findById(loanId, createdBy);
      if (!existingLoan) {
        this.logger.warn({ loanId, createdBy }, 'Loan not found for loan item update');
        throw new NotFoundException('Loan not found');
      }

      if (existingLoan.status === ELoanStatus.CLOSED) {
        this.logger.warn({ loanId }, 'Attempted to update loan item in closed loan');
        throw new BadRequestException('Cannot update loan item in a closed loan');
      }
      if (!existingLoanItem) {
        this.logger.warn({ loanId, itemId }, 'Loan item not found');
        throw new NotFoundException('Loan item not found');
      }
      if (updateData?.itemId) {
        const item = await this.itemsRepo.findById(updateData?.itemId);
        if (!item) {
          this.logger.warn({ itemId }, 'Item not found');
          throw new NotFoundException('Item not found');
        }
      }
      if (updateData.removeImage && updateData.image) {
        throw new BadRequestException('Cannot remove image and upload a new image in the same request');
      }
      if (updateData.removeImage) {
        if (existingLoanItem.imageRef) {
          try {
            await this.loansFileStorage.removeAsync(existingLoanItem.imageRef);
          } catch (err) {
            this.logger.warn(
              { err, imageRef: existingLoanItem.imageRef },
              'Failed to delete loan item image from storage',
            );
          }
        }
        updateData.imageRef = null;
      }
      // Handle image update if provided
      if (updateData.image) {
        const normalized = await normalizeImageBufferForStorageOrThrow(
          updateData.image.buffer,
          updateData.image.mimetype,
          updateData.image.originalname,
        );
        const proposedRef = `loans/items/${loanId}/${itemId}.${normalized.fileExtension}`;
        updateData.imageRef = await this.loansFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
        );
      }

      // Update the loan item
      const itemPatch = plainToInstance(UpdateLoanItemPatch, updateData, {
        excludeExtraneousValues: true,
      });
      const updatedLoanItem = await this.loanItemsRepo.update(itemId, loanId, itemPatch);
      if (!updatedLoanItem) {
        throw new NotFoundException('Loan item not found');
      }

      // Calculate the difference in the specific loan item amount (coerce - DB decimals/form data can be strings)
      const oldItemAmount = Number(existingLoanItem.amount);
      const newItemAmount = Number(updateData.amount ?? existingLoanItem.amount);
      const itemAmountDifference = newItemAmount - oldItemAmount;

      // Calculate original total loan amount (sum of all original loan items before update)
      // Formula: originalTotal = amountRemaining + amountPaid (use Number - PG decimals are strings)
      const amountRemainingNum = Number(existingLoan.amountRemaining);
      const amountPaidNum = Number(existingLoan.amountPaid);
      const originalTotalLoanAmount = amountRemainingNum + amountPaidNum;

      // New total loan amount after item update
      const newTotalLoanAmount = originalTotalLoanAmount + itemAmountDifference;

      // New amount remaining = new total - amount already paid
      const newAmountRemaining = newTotalLoanAmount - amountPaidNum;

      // Ensure amount remaining doesn't go negative
      if (newAmountRemaining < 0) {
        this.logger.warn(
          { loanId, newAmountRemaining, amountPaid: amountPaidNum },
          'New loan amount would be less than amount paid',
        );
        throw new BadRequestException(
          'Cannot update loan item: new loan amount would be less than amount already paid',
        );
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
          {
            amountRemaining,
            interestPercentage,
            tenureValue,
            interestCalculationMethod: existingLoan.interestCalculationMethod,
          },
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
          {
            amountRemaining,
            interestPercentage,
            tenureValue,
            interestCalculationMethod: existingLoan.interestCalculationMethod,
            calculatedInterest: updatedLoanData.interestRemaining,
          },
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
      const startDate = this.resolveUnpaidDueStartDate(
        existingLoan,
        paidDues,
        existingLoan.createdAt ? new Date(existingLoan.createdAt) : new Date(),
        false,
      );

      await this.duesRepo.deleteByLoanId(loanId, UNPAID_DUE_TYPES);

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
        this.logger.info(
          { loanId, remainingTenure, paidDuesCount },
          'Dues recalculated successfully after loan item update',
        );
      }

      this.logger.info({ loanId, itemId }, 'Loan item updated successfully');
      await this.enrichLoanItemsWithImageUrls([updatedLoanItem]);
      await this.invalidateLoanStatsCache(createdBy);
      return updatedLoanItem;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error({ err, itemId, createdBy }, 'Error updating loan item');
      throw err;
    }
  }

  async uploadVoucherSignatures(
    loanId: string,
    createdBy: string,
    signerName: string,
    signatureFile: Express.Multer.File,
    fingerprintFile?: Express.Multer.File,
    removeFingerprint?: boolean,
  ): Promise<Loan> {
    try {
      this.logger.info({ loanId, createdBy }, 'Uploading loan voucher signatures');

      const existingLoan = await this.loansRepo.findById(loanId, createdBy);
      if (!existingLoan) {
        throw new NotFoundException('Loan not found');
      }

      if (!signatureFile?.buffer?.length) {
        throw new BadRequestException('Signature image is required');
      }

      const trimmedSignerName = signerName?.trim();
      if (!trimmedSignerName) {
        throw new BadRequestException('Signer name is required');
      }

      const signatureNormalized = await normalizeImageBufferForStorageOrThrow(
        signatureFile.buffer,
        signatureFile.mimetype,
        signatureFile.originalname,
      );
      const signatureKey = `loans/signatures/${loanId}/signature.${signatureNormalized.fileExtension}`;

      if (existingLoan.signatureRef && this.isStorageKey(existingLoan.signatureRef)) {
        try {
          await this.loansFileStorage.removeAsync(existingLoan.signatureRef);
        } catch (err) {
          this.logger.warn({ err, key: existingLoan.signatureRef }, 'Failed to delete old signature from storage');
        }
      }

      const storedSignatureKey = await this.loansFileStorage.writeAsync(
        signatureKey,
        signatureNormalized.buffer,
        signatureNormalized.mimetype,
      );

      let storedFingerprintKey: string = existingLoan.fingerprintRef;

      if (removeFingerprint) {
        if (existingLoan.fingerprintRef && this.isStorageKey(existingLoan.fingerprintRef)) {
          try {
            await this.loansFileStorage.removeAsync(existingLoan.fingerprintRef);
          } catch (err) {
            this.logger.warn({ err, key: existingLoan.fingerprintRef }, 'Failed to delete fingerprint from storage');
          }
        }
        storedFingerprintKey = null;
      } else if (fingerprintFile?.buffer?.length) {
        const fingerprintNormalized = await normalizeImageBufferForStorageOrThrow(
          fingerprintFile.buffer,
          fingerprintFile.mimetype,
          fingerprintFile.originalname,
        );
        const fingerprintKey = `loans/signatures/${loanId}/fingerprint.${fingerprintNormalized.fileExtension}`;

        if (existingLoan.fingerprintRef && this.isStorageKey(existingLoan.fingerprintRef)) {
          try {
            await this.loansFileStorage.removeAsync(existingLoan.fingerprintRef);
          } catch (err) {
            this.logger.warn(
              { err, key: existingLoan.fingerprintRef },
              'Failed to delete old fingerprint from storage',
            );
          }
        }

        storedFingerprintKey = await this.loansFileStorage.writeAsync(
          fingerprintKey,
          fingerprintNormalized.buffer,
          fingerprintNormalized.mimetype,
        );
      }

      const updatedLoan = await this.loansRepo.update(loanId, {
        ...existingLoan,
        createdBy,
        signerName: trimmedSignerName,
        signatureRef: storedSignatureKey,
        fingerprintRef: storedFingerprintKey,
      } as Loan);

      if (!updatedLoan) {
        throw new NotFoundException('Loan not found');
      }

      updatedLoan.loanItems = existingLoan.loanItems;
      await this.enrichLoanItemsWithImageUrls(updatedLoan.loanItems ?? []);
      await this.enrichLoanWithVoucherSignatureUrls(updatedLoan);

      this.logger.info({ loanId }, 'Loan voucher signatures stored');
      return updatedLoan;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error({ err, loanId, createdBy }, 'Error uploading loan voucher signatures');
      throw err;
    }
  }

  async getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats> {
    try {
      this.logger.debug({ userId, filterOptions }, 'Getting loan stats');
      const startDate = new Date(filterOptions.startDate);
      const endDate = new Date(filterOptions.endDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      return this.cache.getOrLoadVersioned(
        CACHE_NAMESPACE.LOAN_STATS,
        userId,
        loanStatsCacheParts(startDate, endDate, filterOptions.itemId),
        DASHBOARD_CACHE_TTL_SECONDS,
        async () => {
          const statsFilter = {
            ...filterOptions,
            startDate,
            endDate,
          };
          return this.loansRepo.getStats(userId, statsFilter);
        },
      );
    } catch (err) {
      this.logger.error({ err, userId, filterOptions }, 'Error getting loan stats');
      throw err;
    }
  }

  async update(id: string, updateData: Loan): Promise<Loan> {
    return this.unitOfWork.runInTransaction(() => this.updateWithinTransaction(id, updateData));
  }

  private async updateWithinTransaction(id: string, updateData: Loan): Promise<Loan> {
    try {
      this.logger.info({ loanId: id, createdBy: updateData.createdBy }, 'Updating loan');
      // Editing terms recomputes balances, so no transaction may land on this
      // loan between reading them here and writing the new schedule.
      const lockedLoan = await this.loansRepo.lockLoan(id, updateData.createdBy);
      assertLoanVersion(lockedLoan, updateData.version);
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
        throw new BadRequestException(
          'Cannot update loan status through this endpoint. Use PATCH /loans/:id/status instead',
        );
      }

      // Validate start-date rules before any writes
      const allDues = await this.duesRepo.findByLoanIdAndType(id, [
        EDueType.PAID,
        EDueType.UPCOMING_DUE,
        EDueType.PAST_DUE,
        EDueType.OVERDUE,
      ]);
      const paidDues = allDues.filter((due) => due.type === EDueType.PAID);
      const currentStartDate = existingLoan.createdAt ? new Date(existingLoan.createdAt) : new Date();
      const startDateProvided = updateData.createdAt != null;
      const requestedStartDate = startDateProvided ? new Date(updateData.createdAt) : currentStartDate;

      if (startDateProvided) {
        this.assertStartDateUpdateAllowed(
          existingLoan,
          currentStartDate,
          requestedStartDate,
          existingLoan.interestType,
          allDues,
        );
      }

      const startDateChanged =
        startDateProvided &&
        this.startOfDay(requestedStartDate).getTime() !== this.startOfDay(currentStartDate).getTime();

      const loanTermsChanged =
        startDateChanged ||
        (updateData.tenureType != null && updateData.tenureType !== existingLoan.tenureType) ||
        (updateData.tenureValue != null && Number(updateData.tenureValue) !== Number(existingLoan.tenureValue)) ||
        (updateData.interestType != null && updateData.interestType !== existingLoan.interestType) ||
        (updateData.interestPercentage != null &&
          Number(updateData.interestPercentage) !== Number(existingLoan.interestPercentage)) ||
        (updateData.interestCalculationMethod != null &&
          updateData.interestCalculationMethod !== existingLoan.interestCalculationMethod);

      const hasPriorPayments =
        paidDues.length > 0 || Number(existingLoan.amountPaid ?? 0) > 0 || Number(existingLoan.interestPaid ?? 0) > 0;

      // Check if fields that affect dues calculation have changed
      const duesNeedRecalculation = loanTermsChanged || !!updateData.amountRemaining;

      // Merge update data with existing loan data to get final values
      // Exclude status from updateData to prevent status changes through this endpoint
      const { status, interestPrincipalBasis, ...updateDataWithoutStatus } = updateData;

      if (hasPriorPayments && loanTermsChanged && !interestPrincipalBasis) {
        throw new BadRequestException(
          'Choose whether to recalculate interest on remaining principal or total principal.',
        );
      }

      const principalBasis = interestPrincipalBasis ?? EInterestPrincipalBasis.REMAINING;
      const finalLoanData: Loan = {
        ...existingLoan,
        ...updateDataWithoutStatus,
        id: existingLoan.id,
        customerId: updateData.customerId ?? existingLoan.customerId,
        createdBy: existingLoan.createdBy,
        createdAt: startDateProvided ? requestedStartDate : existingLoan.createdAt,
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
        const amountRemaining = Number(updateData.amountRemaining ?? existingLoan.amountRemaining);
        const amountPaid = Number(existingLoan.amountPaid ?? 0);
        const interestPaid = Number(existingLoan.interestPaid ?? 0);
        const interestPercentage = Number(updateData.interestPercentage ?? existingLoan.interestPercentage);
        const tenureValue = Number(updateData.tenureValue ?? existingLoan.tenureValue);
        const interestCalculationMethod =
          updateData.interestCalculationMethod ?? existingLoan.interestCalculationMethod;

        const useTotalPrincipal = hasPriorPayments && principalBasis === EInterestPrincipalBasis.TOTAL;
        const principalForInterest = useTotalPrincipal ? amountRemaining + amountPaid : amountRemaining;

        // Validate that all required values are valid numbers
        if (
          isNaN(principalForInterest) ||
          isNaN(interestPercentage) ||
          isNaN(tenureValue) ||
          principalForInterest < 0 ||
          interestPercentage < 0 ||
          tenureValue < 0
        ) {
          this.logger.error(
            { principalForInterest, interestPercentage, tenureValue, interestCalculationMethod, principalBasis },
            'Invalid values for interest calculation',
          );
          throw new BadRequestException('Invalid loan parameters for interest calculation');
        }

        const calculatedInterest = this.calculateInterestAmount(
          principalForInterest,
          interestPercentage,
          tenureValue,
          interestCalculationMethod,
        );

        finalLoanData.interestRemaining = useTotalPrincipal
          ? Math.max(0, Number((calculatedInterest - interestPaid).toFixed(2)))
          : calculatedInterest;

        // Ensure interestRemaining is a valid number
        if (isNaN(finalLoanData.interestRemaining) || !isFinite(finalLoanData.interestRemaining)) {
          this.logger.error(
            {
              principalForInterest,
              interestPercentage,
              tenureValue,
              interestCalculationMethod,
              principalBasis,
              calculatedInterest,
              interestPaid,
            },
            'Calculated interest is NaN or infinite',
          );
          throw new BadRequestException('Invalid interest calculation result');
        }
      } else {
        // Keep existing interest remaining if not recalculating
        finalLoanData.interestRemaining = existingLoan.interestRemaining;
      }

      if (!duesNeedRecalculation) {
        const updatedLoan = await this.loansRepo.update(id, finalLoanData);
        await this.rebaselineLoan(updatedLoan);
        this.logger.info({ loanId: id }, 'Loan updated successfully');
        await this.invalidateLoanStatsCache(updateData.createdBy);
        return updatedLoan;
      }

      this.logger.info({ loanId: id }, 'Recalculating dues for updated loan');
      const paidDuesCount = paidDues.length;
      const remainingAmount = Number(finalLoanData.amountRemaining ?? existingLoan.amountRemaining);
      const remainingInterest = Number(finalLoanData.interestRemaining ?? existingLoan.interestRemaining);
      const totalTenure = Number(finalLoanData.tenureValue ?? existingLoan.tenureValue);
      const interestType = finalLoanData.interestType ?? existingLoan.interestType;
      const tenureType = finalLoanData.tenureType ?? existingLoan.tenureType;
      const totalDuePeriods = this.calculateNumberOfDues(interestType, tenureType, totalTenure);
      const remainingDuePeriods = Math.max(0, totalDuePeriods - paidDuesCount);

      if (totalDuePeriods < paidDuesCount) {
        throw new BadRequestException('Loan tenure cannot be shorter than the number of dues already paid');
      }

      let unpaidDues: Due[] = [];
      const hasRemainingBalance = remainingAmount > 0 || remainingInterest > 0;

      if (hasRemainingBalance) {
        const loanForDuesBase: Loan = {
          ...finalLoanData,
          id: existingLoan.id,
          interestType,
          tenureType,
          customerId: finalLoanData.customerId ?? existingLoan.customerId,
          createdBy: existingLoan.createdBy,
        };

        if (startDateChanged && paidDuesCount > 0) {
          // Match unpaid slots on the new schedule (paid due dates may not align with new start)
          unpaidDues = this.buildUnpaidDuesForRescheduledLoan(
            loanForDuesBase,
            requestedStartDate,
            totalDuePeriods,
            paidDues,
            remainingAmount,
            remainingInterest,
          );
        } else if (startDateChanged) {
          unpaidDues = this.buildDuesForLoan(
            { ...loanForDuesBase, tenureValue: totalTenure },
            {
              startDate: this.startOfDay(requestedStartDate),
              remainingAmount,
              remainingInterest,
              remainingTenure: totalTenure,
              duePeriodCount: totalDuePeriods,
            },
          );
        } else if (remainingDuePeriods > 0) {
          const dueStartDate = this.resolveUnpaidDueStartDate(finalLoanData, paidDues, currentStartDate, false);

          unpaidDues = this.buildDuesForLoan(
            {
              ...loanForDuesBase,
              tenureValue: totalTenure,
              amountRemaining: remainingAmount,
              interestRemaining: remainingInterest,
              createdAt: dueStartDate,
            },
            {
              startDate: dueStartDate,
              remainingAmount,
              remainingInterest,
              remainingTenure: totalTenure,
              duePeriodCount: remainingDuePeriods,
            },
          );
        } else {
          // All nominal periods paid but balance remains — single due for outstanding amount
          const dueStartDate = this.resolveUnpaidDueStartDate(finalLoanData, paidDues, currentStartDate, false);
          unpaidDues = this.buildDuesForLoan(
            {
              ...loanForDuesBase,
              tenureValue: 1,
              amountRemaining: remainingAmount,
              interestRemaining: remainingInterest,
              createdAt: dueStartDate,
            },
            {
              startDate: dueStartDate,
              remainingAmount,
              remainingInterest,
              remainingTenure: 1,
              duePeriodCount: 1,
            },
          );
        }
      }

      // Atomically update loan + replace unpaid dues (paid dues never touched)
      const updatedLoan = await this.loansRepo.updateAndReplaceUnpaidDues(
        id,
        finalLoanData,
        unpaidDues,
        UNPAID_DUE_TYPES,
      );

      await this.rebaselineLoan(updatedLoan);

      this.logger.info(
        { loanId: id, totalDuePeriods, remainingDuePeriods, paidDuesCount, unpaidDues: unpaidDues.length },
        'Loan updated and unpaid dues regenerated successfully',
      );
      await this.invalidateLoanStatsCache(updateData.createdBy);
      return updatedLoan;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      this.logger.error({ err, loanId: id }, 'Error updating loan');
      throw err;
    }
  }

  /**
   * Editing loan terms recomputes balances from scratch, so earlier transactions
   * can no longer be replayed onto them. Move the checkpoint to the new state and
   * mark everything recorded so far as frozen history.
   */
  private async rebaselineLoan(loan: Loan): Promise<void> {
    if (!loan?.id) return;
    const seq = await this.loansRepo.getMaxTransactionSeq(loan.id);
    await this.loansRepo.setBaseline(
      loan.id,
      loan.createdBy,
      plainToInstance(LoanBaselineData, {
        amountRemaining: Number(loan.amountRemaining ?? 0),
        amountPaid: Number(loan.amountPaid ?? 0),
        interestRemaining: Number(loan.interestRemaining ?? 0),
        interestPaid: Number(loan.interestPaid ?? 0),
        seq,
      }),
    );
    this.logger.debug({ loanId: loan.id, baselineSeq: seq }, 'Loan replay baseline moved');
  }

  async recalculateDuesForLoan(loanId: string, createdBy: string): Promise<void> {
    const existingLoan = await this.loansRepo.findById(loanId, createdBy);
    if (!existingLoan) {
      throw new NotFoundException('Loan not found');
    }
    if (existingLoan.status === ELoanStatus.CLOSED) {
      return;
    }

    const paidDues = await this.duesRepo.findByLoanIdAndType(loanId, [EDueType.PAID]);
    const paidDuesCount = paidDues.length;
    const totalTenure = existingLoan.tenureValue;
    let remainingTenure = Math.max(0, totalTenure - paidDuesCount);
    const remainingAmount = existingLoan.amountRemaining;
    const remainingInterest = existingLoan.interestRemaining;

    // Nothing to distribute - exit (delete any stale unpaid dues)
    if (remainingAmount <= 0 && remainingInterest <= 0) {
      await this.duesRepo.deleteByLoanId(loanId, UNPAID_DUE_TYPES);
      return;
    }

    // When all dues are paid but we have remaining amount (e.g. from top-up), use full tenure for new dues
    if (remainingTenure <= 0) {
      remainingTenure = totalTenure;
    }

    const startDate = this.resolveUnpaidDueStartDate(
      existingLoan,
      paidDues,
      existingLoan.createdAt ? new Date(existingLoan.createdAt) : new Date(),
      false,
    );

    await this.duesRepo.deleteByLoanId(loanId, UNPAID_DUE_TYPES);

    const loanForDues: Loan = {
      ...existingLoan,
      tenureValue: remainingTenure,
      amountRemaining: remainingAmount,
      interestRemaining: remainingInterest,
      createdAt: startDate,
    };

    await this.createDuesForLoan(loanForDues, {
      startDate,
      remainingAmount,
      remainingInterest,
      remainingTenure,
    });
    this.logger.info({ loanId, remainingTenure, paidDuesCount }, 'Dues recalculated successfully');
  }

  async delete(id: string, createdBy: string): Promise<void> {
    return this.unitOfWork.runInTransaction(() => this.deleteWithinTransaction(id, createdBy));
  }

  private async deleteWithinTransaction(id: string, createdBy: string): Promise<void> {
    try {
      this.logger.info({ loanId: id, createdBy }, 'Deleting loan');
      const existingLoan = await this.loansRepo.findById(id, createdBy);
      if (!existingLoan) {
        this.logger.warn({ loanId: id, createdBy }, 'Loan not found for deletion');
        throw new NotFoundException('Loan not found');
      }

      await this.transactionsRepo.deleteByLoanId(id);
      await this.duesRepo.deleteByLoanId(id);
      await this.loanItemsRepo.deleteByLoanId(id);
      await this.loansRepo.delete(id, createdBy);
      this.logger.info({ loanId: id }, 'Loan deleted successfully');
      await this.invalidateLoanStatsCache(createdBy);
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, loanId: id, createdBy }, 'Error deleting loan');
      throw err;
    }
  }

  /**
   * Rebuild unpaid dues after a start-date change when some periods are already paid.
   * Builds the full tenure schedule from the new start and skips paid due dates so
   * gaps before the last paid due (e.g. Aug when Sep is paid) are preserved.
   */
  private buildUnpaidDuesForRescheduledLoan(
    loan: Loan,
    scheduleStartDate: Date,
    totalDuePeriods: number,
    paidDues: Due[],
    remainingAmount: number,
    remainingInterest: number,
  ): Due[] {
    const loanId = loan.id;
    if (!loanId || !loan.customerId || !loan.createdBy) {
      throw new Error('Loan ID, customer ID, and created by are required');
    }

    const anchor = this.startOfDay(scheduleStartDate);
    const paidDueTimes = new Set(paidDues.map((d) => this.startOfDay(new Date(d.dueDate)).getTime()));

    const unpaidDueDates: Date[] = [];
    for (let period = 1; period <= totalDuePeriods; period++) {
      const dueDate = this.calculateDueDate(anchor, loan.interestType, period);
      if (!paidDueTimes.has(this.startOfDay(dueDate).getTime())) {
        unpaidDueDates.push(dueDate);
      }
    }

    if (!unpaidDueDates.length) {
      return [];
    }

    const principalPerDue = remainingAmount / unpaidDueDates.length;
    const interestPerDue = remainingInterest / unpaidDueDates.length;
    const dues: Due[] = unpaidDueDates.map((dueDate) => {
      const principalAmount = Number(principalPerDue.toFixed(2));
      const interestAmount = Number(interestPerDue.toFixed(2));
      return {
        loanId,
        customerId: loan.customerId,
        principalAmount,
        interestAmount,
        dueAmount: Number((principalAmount + interestAmount).toFixed(2)),
        type: EDueType.UPCOMING_DUE,
        dueDate,
        createdBy: loan.createdBy,
      };
    });

    this.fixRoundingDrift(dues, remainingAmount, remainingInterest);
    return dues;
  }

  /**
   * Schedule anchor for rebuilding unpaid dues after the last paid period.
   * Returns the loan start when nothing is paid yet (or start date was reset).
   * When dues are paid, returns the last paid due date so period 1 lands on the
   * next unpaid due (buildDuesForLoan adds one period to the anchor).
   */
  private resolveUnpaidDueStartDate(loan: Loan, paidDues: Due[], loanStartDate: Date, useLoanStartDate: boolean): Date {
    if (useLoanStartDate || paidDues.length === 0) {
      return this.startOfDay(loanStartDate);
    }

    const sortedPaid = [...paidDues].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const lastPaidDue = sortedPaid[sortedPaid.length - 1];
    return this.startOfDay(new Date(lastPaidDue.dueDate));
  }

  private calculateInterestAmount(
    principal: number,
    interestPercentage: number,
    tenureValue: number,
    interestCalculationMethod: EInterestCalculationMethod,
  ): number {
    if (interestCalculationMethod === EInterestCalculationMethod.COMPOUND) {
      return (interestPercentage * principal * (1 + interestPercentage / 100) ** tenureValue) / 100;
    }
    return (interestPercentage * principal * tenureValue) / 100;
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
    if (!dues.length) return;

    const targetPrincipal = Number(totalPrincipal) || 0;
    const targetInterest = Number(totalInterest) || 0;
    const principalSum = dues.reduce((sum, d) => sum + Number(d.principalAmount), 0);
    const interestSum = dues.reduce((sum, d) => sum + Number(d.interestAmount), 0);

    const principalDiff = Number((targetPrincipal - principalSum).toFixed(2));
    const interestDiff = Number((targetInterest - interestSum).toFixed(2));

    const lastDue = dues[dues.length - 1];
    lastDue.principalAmount = Number((Number(lastDue.principalAmount) + principalDiff).toFixed(2));
    lastDue.interestAmount = Number((Number(lastDue.interestAmount) + interestDiff).toFixed(2));

    for (const due of dues) {
      due.principalAmount = Number(Number(due.principalAmount).toFixed(2));
      due.interestAmount = Number(Number(due.interestAmount).toFixed(2));
      due.dueAmount = Number((due.principalAmount + due.interestAmount).toFixed(2));
    }
  }

  private async invalidateLoanStatsCache(userId?: string): Promise<void> {
    if (!userId) return;
    await this.cache.bumpUserCache(CACHE_NAMESPACE.LOAN_STATS, userId);
  }
}
