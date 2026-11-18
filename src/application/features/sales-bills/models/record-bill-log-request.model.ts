import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { CLIENT_BILL_LOG_ACTIONS } from '../enums';
export class RecordBillLogRequestModel {
  @ApiProperty({ enum: CLIENT_BILL_LOG_ACTIONS })
  @IsIn(CLIENT_BILL_LOG_ACTIONS as unknown as string[])
  action: (typeof CLIENT_BILL_LOG_ACTIONS)[number];
}
