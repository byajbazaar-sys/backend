import { ApiPropertyOptional } from '@nestjs/swagger';
import { AMOUNT_MAX } from '@shared-libs';
import { Expose, Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { ETransactionPaidIn } from '../enums';

/** Correct payment method and/or amount; replays loan history when the row is not the latest. */
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
