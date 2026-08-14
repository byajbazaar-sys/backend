import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRefundRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Refund amount in INR; defaults to full remaining amount' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @Expose()
  @ApiPropertyOptional({ example: 'Customer requested refund' })
  @IsOptional()
  @IsString()
  reason?: string;
}
