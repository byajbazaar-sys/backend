import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddOrderNoteRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  note: string;

  @ApiPropertyOptional({ description: 'When true, note is staff-only (stored in activity metadata)' })
  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}
