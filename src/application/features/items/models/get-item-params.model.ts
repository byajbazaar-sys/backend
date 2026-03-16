import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { Expose } from 'class-transformer';

export class GetItemParamsModel {
  @Expose()
  @ApiProperty({ description: 'Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
}
