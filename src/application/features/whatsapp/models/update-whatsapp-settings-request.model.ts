import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateWhatsAppSettingsRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ description: 'Send automated WhatsApp due payment reminders to customers' })
  @Expose()
  @IsBoolean()
  dueRemindersEnabled: boolean;
}
