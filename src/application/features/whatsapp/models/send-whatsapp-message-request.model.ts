import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

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
}
