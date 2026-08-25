import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { EWhatsAppTemplateCategory } from '../enums';

export class CreateWhatsAppTemplateRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ example: 'payment_reminder' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/)
  name: string;

  @ApiProperty({ example: 'en_US' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language: string;

  @ApiProperty({ enum: EWhatsAppTemplateCategory, example: EWhatsAppTemplateCategory.Utility })
  @IsEnum(EWhatsAppTemplateCategory)
  category: EWhatsAppTemplateCategory;

  @ApiProperty({ example: 'Hello {{1}}, your payment of {{2}} is due on {{3}}.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  bodyText: string;
}
