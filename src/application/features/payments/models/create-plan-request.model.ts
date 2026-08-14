import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePlanRequestModel {
  @Expose()
  @ApiProperty({ example: 'Professional' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Expose()
  @ApiProperty({ example: 599, description: 'Monthly price in INR' })
  @IsNumber()
  @Min(1)
  price!: number;

  @Expose()
  @ApiPropertyOptional({ example: 'INR', default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @Expose()
  @ApiPropertyOptional({ example: 'monthly', default: 'monthly' })
  @IsOptional()
  @IsString()
  interval?: string;

  @Expose()
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  intervalCount?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Existing Razorpay plan id to reuse' })
  @IsOptional()
  @IsString()
  providerPlanId?: string;

  @Expose()
  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
