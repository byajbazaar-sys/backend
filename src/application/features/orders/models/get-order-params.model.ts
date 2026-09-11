import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetOrderParamsModel {
  @ApiProperty()
  @IsUUID()
  id: string;
}
