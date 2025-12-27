import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetUserParamsModel {
  @ApiProperty({ format: 'uuid', example: 'c9e5d9d4-9f0d-4f7a-9c6c-0f2a5a88a111' })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
