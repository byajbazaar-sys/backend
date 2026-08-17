import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class NotificationResponseModel {
  @Expose()
  @ApiProperty({ example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327', description: 'Notification ID' })
  id: string;

  @Expose()
  @ApiProperty({ example: 'email', description: 'Notification channel', enum: ['email', 'sms'] })
  channel: string;

  @Expose()
  @ApiProperty({ example: 'user@example.com', description: 'Recipient' })
  recipient: string;

  @Expose()
  @ApiPropertyOptional({ example: 'Welcome', description: 'Subject (for email)' })
  subject?: string;

  @Expose()
  @ApiProperty({ example: 'sent', description: 'Status', enum: ['pending', 'sent', 'failed'] })
  status: string;

  @Expose()
  @ApiPropertyOptional({ description: 'External provider ID (e.g. Resend message ID)' })
  externalId?: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Error message if failed' })
  errorMessage?: string;

  @Expose()
  @ApiProperty({ description: 'Created at' })
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Updated at' })
  @Type(() => Date)
  updatedAt: Date;
}
