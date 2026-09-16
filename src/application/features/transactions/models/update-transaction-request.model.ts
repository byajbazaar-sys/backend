import { ApiPropertyOptional } from '@nestjs/swagger';
import { AMOUNT_MAX } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { ETransactionPaidIn } from '../enums';

/** Correct payment method, amount, and/or business payment date; amount replays loan history when not latest. */
export class UpdateTransactionRequestModel {
  @Expose()
  @ApiPropertyOptional({ enum: ETransactionPaidIn, example: ETransactionPaidIn.CASH })
  @IsOptional()
  @IsEnum(ETransactionPaidIn)
  paidIn?: ETransactionPaidIn;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({
    description: 'New amount (due payments cannot be edited; invalid later history is rejected on replay)',
    example: 5000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(AMOUNT_MAX)
  amount?: number;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Optional business payment date (YYYY-MM-DD). Display/receipts only; does not affect balances or replay. Omit to leave unchanged; use today to clear a back-date.',
    example: '2024-09-10',
  })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({
    description:
      'Loan version this edit was based on. When sent, the update is rejected with 409 if the loan changed since it was read.',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedLoanVersion?: number;
}
