import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class UpdateWhatsAppSettingsRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiPropertyOptional({ description: 'Send automated WhatsApp due payment reminders to customers' })
  @Expose()
  @IsOptional()
  @IsBoolean()
  dueRemindersEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Approved Meta template name for messaging customers outside the 24-hour window (lowercase, underscores only)',
    example: 'byajbazaar_hello',
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'reengagementTemplateName must use lowercase letters, numbers, and underscores only',
  })
  reengagementTemplateName?: string;

  @ApiPropertyOptional({
    description: 'Meta template language code for the re-engagement template',
    example: 'en',
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[a-z]{2}(_[A-Za-z]{2,8})?$/, {
    message: 'reengagementTemplateLanguage must be a valid locale code (e.g. en or en_US)',
  })
  reengagementTemplateLanguage?: string;
}
