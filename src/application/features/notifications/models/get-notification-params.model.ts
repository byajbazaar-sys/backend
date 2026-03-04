import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';

export class GetNotificationParamsModel {
  @ApiProperty({ description: 'Notification ID', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  @IsMongoId({ message: 'id must be a valid MongoDB ObjectId' })
  id: string;
}
