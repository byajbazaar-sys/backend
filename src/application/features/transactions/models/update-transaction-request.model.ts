import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { ETransactionPaidIn } from '../enums';
import { AMOUNT_MAX } from '@shared-libs';

/** Safe correction: payment method and/or latest-transaction amount only. */
export class UpdateTransactionRequestModel {
  @Expose()
  @ApiPropertyOptional({ enum: ETransactionPaidIn, example: ETransactionPaidIn.CASH })
  @IsOptional()
  @IsEnum(ETransactionPaidIn)
  paidIn?: ETransactionPaidIn;

  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'New amount (latest transaction only)', example: 5000 })
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
