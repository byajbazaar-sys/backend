import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class ExtendTrialRequestModel {
  @Expose()
  @ApiPropertyOptional({ description: 'Extend trial by this many days from now or current trial end' })
  @ValidateIf((o) => !o.trialEndsAt)
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Set trial end to this exact date (ISO 8601)' })
  @ValidateIf((o) => !o.days)
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;
}
