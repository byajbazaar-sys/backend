import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePlanRequestModel {
  @Expose()
  @ApiPropertyOptional({ example: 'Professional' })
  @IsOptional()
  @IsString()
  name?: string;

  @Expose()
  @ApiPropertyOptional({ example: 599 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  price?: number;

  @Expose()
  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @Expose()
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
