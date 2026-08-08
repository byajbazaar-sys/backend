import { EDepositStatus } from '../enums';

export interface CreateDepositAccountInput {
  depositNumber: string;
  customerId: string;
  createdBy: string;
  name?: string;
  notes?: string;
  currentBalance: number;
  totalDeposited: number;
  status: EDepositStatus;
}
