import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class GetUserParamsModel {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsMongoId({ message: 'id must be a valid MongoDB ObjectId' })
  id: string;
}
