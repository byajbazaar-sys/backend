import {
  DepositAccount,
  DepositTransaction,
  CreateDepositAccountData,
  AddDepositData,
  AdjustDepositData,
  RefundDepositData,
} from '../domain';
import { DepositsFilterOptions, DepositsDownloadFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { DepositStats } from './deposit-stats';

export const DEPOSIT_SERVICE = 'IDepositService';

export interface IDepositService {
  create(customerId: string, createdBy: string, data: CreateDepositAccountData): Promise<DepositAccount>;
  findAll(options: DepositsFilterOptions): Promise<Paged<DepositAccount>>;
  findOne(id: string, createdBy: string): Promise<DepositAccount>;
  getStats(createdBy: string): Promise<DepositStats>;
  getRecentTransactions(createdBy: string): Promise<DepositTransaction[]>;
  addDeposit(id: string, createdBy: string, data: AddDepositData): Promise<DepositAccount>;
  adjust(id: string, createdBy: string, data: AdjustDepositData): Promise<DepositAccount>;
  refund(id: string, createdBy: string, data: RefundDepositData): Promise<DepositAccount>;
  getLedger(id: string, createdBy: string): Promise<DepositTransaction[]>;
  download(options: DepositsDownloadFilterOptions, format: 'csv' | 'pdf'): Promise<Buffer>;
  delete(id: string, createdBy: string): Promise<void>;
}
