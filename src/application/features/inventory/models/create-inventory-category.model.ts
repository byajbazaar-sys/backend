import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInventoryCategoryRequestModel {
  @ApiProperty({ example: 'Ring' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

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
