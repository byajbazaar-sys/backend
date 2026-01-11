import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';
import { Expose } from 'class-transformer';

export class GetItemParamsModel {
  @Expose()
  @ApiProperty({ description: 'Item ID', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  @IsMongoId()
  id: string;
}
