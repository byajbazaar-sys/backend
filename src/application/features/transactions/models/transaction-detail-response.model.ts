import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { TransactionLogResponseModel } from './transaction-log-response.model';
import { TransactionResponseModel } from './transaction-response.model';

export class TransactionDetailResponseModel {
  @Expose()
  @Type(() => TransactionResponseModel)
  @ApiProperty({ type: TransactionResponseModel })
  transaction: TransactionResponseModel;

  @Expose()
  @Type(() => TransactionLogResponseModel)
  @ApiProperty({ type: [TransactionLogResponseModel], description: 'Edit history, oldest first' })
  logs: TransactionLogResponseModel[];
}
