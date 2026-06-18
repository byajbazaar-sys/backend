import { Expose, Type } from 'class-transformer';
import { EBillStatus, EPaymentMode, ESalesBillSortField, ESalesBillSortOrder, EDocumentType } from '../enums';

export class SalesBillsFilterOptions {
  @Expose()
  createdBy: string;

  @Expose()
  search?: string;

  @Expose()
  dateFrom?: Date;

  @Expose()
  dateTo?: Date;

  @Expose()
  paymentMode?: EPaymentMode;

  @Expose()
  status?: EBillStatus;

  @Expose()
  documentType?: EDocumentType;

  @Expose()
  customerId?: string;

  @Expose()
  sortField?: ESalesBillSortField;

  @Expose()
  sortOrder?: ESalesBillSortOrder;

  @Expose()
  @Type(() => Number)
  pageNumber?: number;

  @Expose()
  @Type(() => Number)
  pageSize?: number;
}
