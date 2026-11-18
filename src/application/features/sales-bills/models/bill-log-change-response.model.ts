import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
export class BillLogChangeResponseModel {
  @Expose() @ApiProperty({ example: 'discount' }) field: string;
  @Expose() @ApiProperty({ example: 'Discount' }) label: string;
  @Expose() @ApiPropertyOptional({ nullable: true, example: 0 }) from: string | number | null;
  @Expose() @ApiPropertyOptional({ nullable: true, example: 500 }) to: string | number | null;
}
