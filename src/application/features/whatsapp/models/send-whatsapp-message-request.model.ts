import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

class WhatsAppTextBodyModel {
  @ApiProperty({ example: 'Hello from ByajBazaar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  body: string;
}

export class SendWhatsAppMessageRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ example: '919XXXXXXXXX', description: 'Recipient WhatsApp number in international format without +' })
  @IsString()
  @Matches(/^\d{8,15}$/)
  to: string;

  @ApiProperty({ enum: ['text'] })
  @IsIn(['text'])
  type: 'text';

  @ApiProperty({ type: WhatsAppTextBodyModel })
  @ValidateNested()
  @Type(() => WhatsAppTextBodyModel)
  text: WhatsAppTextBodyModel;

  @ApiPropertyOptional({
    description: 'Approved Meta template name used when the 24-hour customer service window is closed',
    example: 'test_user',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/)
  reengagementTemplateName?: string;

  @ApiPropertyOptional({
    description: 'Meta template language code matching WhatsApp Manager',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[a-z]{2}(_[A-Za-z]{2,8})?$/)
  reengagementTemplateLanguage?: string;
}
