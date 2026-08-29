import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

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
}
