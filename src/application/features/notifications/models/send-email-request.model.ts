import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EmailAttachmentRequestModel } from './email-attachment-request.model';

export class SendEmailRequestModel {
  @ApiProperty({ description: 'Recipient email', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ description: 'Email subject' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ description: 'Email body (plain text or HTML)' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'Whether body is HTML', default: true })
  @IsBoolean()
  @IsOptional()
  isHtml?: boolean;

  @ApiPropertyOptional({ description: 'Email attachments' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAttachmentRequestModel)
  @IsOptional()
  attachments?: EmailAttachmentRequestModel[];
}
