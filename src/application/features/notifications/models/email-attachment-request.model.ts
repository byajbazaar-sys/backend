import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class EmailAttachmentRequestModel {
  @ApiProperty({ description: 'Base64 encoded content' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'Attachment filename' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiPropertyOptional({ description: 'MIME type', example: 'application/pdf' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Content disposition', example: 'attachment' })
  @IsString()
  @IsOptional()
  disposition?: string;
}
