import { MetalRate } from '../domain';
import { CurrentRateKey } from '../constants';

export const METAL_RATES_REPOSITORY = 'METAL_RATES_REPOSITORY';

export interface MetalRateChartPoint {
  date: string;
  gold24?: number | null;
  gold22?: number | null;
  gold20?: number | null;
  gold18?: number | null;
  silver999?: number | null;
  silver925?: number | null;
}

export interface CurrentRatesResult {
  rates: Partial<Record<CurrentRateKey, number>>;
  updatedAt: Partial<Record<CurrentRateKey, Date>>;
}

export interface IMetalRatesRepository {
  insert(data: MetalRate): Promise<MetalRate>;
  findCurrentRates(userId: string): Promise<MetalRate[]>;
  findHistory(userId: string, page: number, pageSize: number): Promise<{ items: MetalRate[]; totalCount: number }>;
  findById(id: string): Promise<MetalRate | null>;
  deleteById(id: string): Promise<void>;
  findForChart(userId: string, startDate: Date, endDate: Date): Promise<MetalRate[]>;
}
