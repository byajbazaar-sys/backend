import { ApiProperty } from '@nestjs/swagger';
import { IPageable } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

import { WhatsAppMessageHistoryResponseModel } from './whatsapp-message-history-response.model';

export class WhatsAppMessagesPagedResponseModel implements IPageable<WhatsAppMessageHistoryResponseModel> {
  @Expose()
  @Type(() => WhatsAppMessageHistoryResponseModel)
  @ApiProperty({ type: [WhatsAppMessageHistoryResponseModel] })
  items: WhatsAppMessageHistoryResponseModel[];

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  page: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  perPage: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalPages: number;

  @Expose()
  @Type(() => Number)
  @ApiProperty()
  totalCount: number;

  @Expose()
  @ApiProperty()
  hasNextPage: boolean;

  @Expose()
  @ApiProperty()
  hasPreviousPage: boolean;
}
