import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class SendWhatsAppTemplateMessageRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ example: '919XXXXXXXXX' })
  @IsString()
  @Matches(/^\d{8,15}$/)
  to: string;

  @ApiProperty({ example: 'payment_reminder' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/)
  templateName: string;

  @ApiProperty({ example: 'en_US' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  languageCode: string;

  @ApiProperty({ type: [String], example: ['Customer Name', '₹500', '25 August 2026'] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  parameters: string[];
}
