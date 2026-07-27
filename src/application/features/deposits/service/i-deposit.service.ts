import { DepositAccount, DepositTransaction } from '../domain';
import { DepositsFilterOptions, DepositsDownloadFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { DepositStats } from './i-deposits.repository';

export const DEPOSIT_SERVICE = 'IDepositService';

export interface IDepositService {
  create(customerId: string, createdBy: string, data: { name?: string; notes?: string }): Promise<DepositAccount>;
  findAll(options: DepositsFilterOptions): Promise<Paged<DepositAccount>>;
  findOne(id: string, createdBy: string): Promise<DepositAccount>;
  getStats(createdBy: string): Promise<DepositStats>;
  getRecentTransactions(createdBy: string): Promise<DepositTransaction[]>;
  addDeposit(id: string, createdBy: string, data: {
    amount: number;
    paymentMode: string;
    transactionReference?: string;
    depositDate?: string;
    remarks?: string;
  }): Promise<DepositAccount>;
  adjust(id: string, createdBy: string, data: {
    amount: number;
    salesBillId?: string;
    remarks?: string;
  }): Promise<DepositAccount>;
  refund(id: string, createdBy: string, data: {
    amount: number;
    paymentMode: string;
    transactionReference?: string;
    remarks?: string;
  }): Promise<DepositAccount>;
  getLedger(id: string, createdBy: string): Promise<DepositTransaction[]>;
  download(options: DepositsDownloadFilterOptions, format: 'csv' | 'pdf'): Promise<Buffer>;
  delete(id: string, createdBy: string): Promise<void>;
}
