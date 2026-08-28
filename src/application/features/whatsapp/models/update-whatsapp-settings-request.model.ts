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
}
