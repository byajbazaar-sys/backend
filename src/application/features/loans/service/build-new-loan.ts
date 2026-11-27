import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';

import { Loan, LoanItem } from '../domain';
import { CreateLoanRequestModel } from '../models';

/**
 * A new loan from a validated create request, as the loans API saves it: ids for the loan and its lines, the start
 * date as createdAt (existing convention), the principal as the sum of the line amounts. Shared by the loans API and
 * ByajBazaar AI so both make exactly the same loan.
 */
export function buildNewLoan(body: CreateLoanRequestModel, createdBy: string, images?: Express.Multer.File[]): Loan {
  const loanData = plainToInstance(Loan, body, {
    excludeExtraneousValues: true,
  });

  // Issue / start date is stored as createdAt (existing system convention).
  if (body.startDate) {
    loanData.createdAt = new Date(body.startDate);
  }

  const loanId = uuidv4();
  loanData.id = loanId;
  let loanAmount = 0;

  if (!Array.isArray(loanData.loanItems)) {
    loanData.loanItems = loanData.loanItems ? [loanData.loanItems] : [];
  }

  loanData.loanItems = loanData.loanItems.map((item, index) => {
    loanAmount += item.amount;
    const itemId = item.itemId ?? (item as { item_id?: string }).item_id;
    if (!itemId) {
      throw new BadRequestException('Each loan item must have an itemId referencing an existing item');
    }
    const loanItem: LoanItem & { id?: string } = {
      ...item,
      id: uuidv4(),
      itemId,
      image: images?.[index] ?? null,
      loanId,
      createdBy,
    };
    return loanItem;
  });
  loanData.amountRemaining = loanAmount;
  loanData.createdBy = createdBy;
  return loanData;
}
