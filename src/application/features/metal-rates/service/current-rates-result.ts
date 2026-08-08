import { CurrentRateKey } from '../constants';

export interface CurrentRatesResult {
  rates: Partial<Record<CurrentRateKey, number>>;
  updatedAt: Partial<Record<CurrentRateKey, Date>>;
}
