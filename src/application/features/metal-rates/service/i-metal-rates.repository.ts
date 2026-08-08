import { MetalRate } from '../domain';

export const METAL_RATES_REPOSITORY = 'METAL_RATES_REPOSITORY';

export interface IMetalRatesRepository {
  insert(data: MetalRate): Promise<MetalRate>;
  findCurrentRates(userId: string): Promise<MetalRate[]>;
  findHistory(userId: string, page: number, pageSize: number): Promise<{ items: MetalRate[]; totalCount: number }>;
  findById(id: string): Promise<MetalRate>;
  deleteById(id: string): Promise<void>;
  findForChart(userId: string, startDate: Date, endDate: Date): Promise<MetalRate[]>;
}
