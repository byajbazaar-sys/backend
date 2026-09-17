import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class SendWhatsAppDepositMessageRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ example: '919XXXXXXXXX', description: 'Recipient WhatsApp number in international format without +' })
  @IsString()
  @Matches(/^\d{8,15}$/)
  to: string;

  @ApiProperty({ example: 'Shree Jewellers' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  shopName: string;

  @ApiProperty({ example: '5000.00' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  amount: string;

  @ApiProperty({ example: 'DEP-1024' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  depositNumber: string;

  @ApiPropertyOptional({ example: 'Credit' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  transactionType?: string;

  @ApiPropertyOptional({ example: '12500.00' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  balanceAfter?: string;

  @ApiPropertyOptional({ example: 'RCP-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  receiptNumber?: string;

  @ApiPropertyOptional({ example: '17 Sep 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transactionDate?: string;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ description: 'Deposit account ID for message history linking' })
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;
}
