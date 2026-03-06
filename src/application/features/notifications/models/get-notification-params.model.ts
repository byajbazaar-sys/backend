import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class GetNotificationParamsModel {
  @ApiProperty({ description: 'Notification ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  @IsUUID('4', { message: 'id must be a valid UUID' })
  id: string;
}
