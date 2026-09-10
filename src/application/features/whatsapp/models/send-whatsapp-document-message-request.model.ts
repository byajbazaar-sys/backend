import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class SendWhatsAppDocumentMessageRequestModel {
  @ApiProperty({ description: 'Business (tenant) ID — must match authenticated user' })
  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @ApiProperty({ example: '919XXXXXXXXX', description: 'Recipient WhatsApp number in international format without +' })
  @IsString()
  @Matches(/^\d{8,15}$/)
  to: string;

  @ApiProperty({
    description: 'Shop or business name used in the bill template body when outside the 24-hour window',
    example: 'Shree Jewellers',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  shopName: string;
}
