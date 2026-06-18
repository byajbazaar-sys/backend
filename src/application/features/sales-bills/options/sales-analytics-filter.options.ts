import { Expose } from 'class-transformer';
import { EDocumentType } from '../enums';

export class SalesAnalyticsFilterOptions {
  @Expose()
  createdBy: string;

  @Expose()
  dateFrom?: Date;

  @Expose()
  dateTo?: Date;

  @Expose()
  documentType?: EDocumentType;
}
