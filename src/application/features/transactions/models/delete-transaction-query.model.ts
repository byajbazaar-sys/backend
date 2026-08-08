import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class DeleteTransactionQueryRequestModel {
  @Expose()
  @Type(() => Number)
  @ApiPropertyOptional({
    description:
      'Loan version the list was rendered from. When sent, the delete is rejected with 409 if the loan changed since it was read.',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedLoanVersion?: number;
}
