import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInventoryCategoryRequestModel {
  @ApiPropertyOptional({ example: 'Ring' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Gold and diamond rings' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: '7113', description: 'HSN code for GST invoices' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  hsnCode?: string;
}
