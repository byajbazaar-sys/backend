import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCatalogSettingsRequestModel {
  @ApiPropertyOptional({ description: 'Enable or disable the public catalog' })
  @IsOptional()
  @IsBoolean()
  catalogEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Which item details customers see, e.g. { "price": false, "netWeight": true }',
    example: { price: true, netWeight: true, makingCharges: false },
  })
  @IsOptional()
  @IsObject()
  display?: Record<string, boolean>;

  @ApiPropertyOptional({ description: 'WhatsApp number for enquiries (blank = use the shop phone)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[+\d\s-]*$/, { message: 'WhatsApp number may only contain digits, spaces, + and -' })
  whatsappNumber?: string;
}
