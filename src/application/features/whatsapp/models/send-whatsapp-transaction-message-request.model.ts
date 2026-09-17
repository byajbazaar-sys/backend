import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class SendWhatsAppTransactionMessageRequestModel {
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

  @ApiProperty({ example: '12500.00', description: 'Payment amount (numeric string)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  amount: string;

  @ApiPropertyOptional({ example: 'LN-1024' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  loanNumber?: string;

  @ApiPropertyOptional({ example: 'Interest payment' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transactionType?: string;

  @ApiPropertyOptional({ example: 'UPI' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paidIn?: string;

  @ApiPropertyOptional({ example: '17 Sep 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentDate?: string;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ description: 'Loan transaction ID for message history linking' })
  @IsOptional()
  @IsUUID()
  transactionId?: string;
}
