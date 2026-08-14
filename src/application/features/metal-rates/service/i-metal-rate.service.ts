import { MetalRate } from '../domain';
import { CreateMetalRateRequestModel, ListMetalRatesQueryModel } from '../models';
import { CurrentMetalRatesResponseModel, MetalRateChartPointModel } from '../models/metal-rate-response.model';

export const METAL_RATE_SERVICE = 'METAL_RATE_SERVICE';

export interface IMetalRateService {
  getCurrent(userId: string): Promise<CurrentMetalRatesResponseModel>;
  create(data: CreateMetalRateRequestModel, userId: string): Promise<MetalRate>;
  listHistory(
    userId: string,
    query: ListMetalRatesQueryModel,
  ): Promise<{
    items: MetalRate[];
    totalCount: number;
    page: number;
    pageSize: number;
  }>;
  deleteEntry(id: string, userId: string): Promise<void>;
  bulkDelete(ids: string[], userId: string): Promise<{ deletedCount: number }>;
  getChart(userId: string, startDate?: string, endDate?: string): Promise<MetalRateChartPointModel[]>;
}
