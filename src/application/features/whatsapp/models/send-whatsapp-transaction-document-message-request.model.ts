import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class SendWhatsAppTransactionDocumentMessageRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ example: '919XXXXXXXXX', description: 'Recipient WhatsApp number in international format without +' })
  @IsString()
  @Matches(/^\d{8,15}$/)
  to: string;

  @ApiProperty({
    description: 'Shop or business name used in the payment receipt template body when outside the 24-hour window',
    example: 'Shree Jewellers',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  shopName: string;

  @ApiPropertyOptional({ description: 'Loan number shown in message history' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  loanNumber?: string;

  @ApiPropertyOptional({ description: 'Receipt number shown in message history' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  receiptNumber?: string;

  @ApiPropertyOptional({ description: 'Customer name shown in message history' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;
}
