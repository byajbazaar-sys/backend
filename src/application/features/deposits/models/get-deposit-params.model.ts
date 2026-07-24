import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetDepositParamsModel {
  @ApiProperty()
  @IsUUID()
  id: string;
}
