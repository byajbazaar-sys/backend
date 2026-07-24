import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDepositRequestModel {
  @ApiProperty({ description: 'Customer ID' })
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional({ description: 'Optional deposit account name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
