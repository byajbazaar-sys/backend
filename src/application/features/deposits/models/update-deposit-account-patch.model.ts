import { EDepositStatus } from '../enums';

export interface UpdateDepositAccountPatch {
  currentBalance?: number;
  totalDeposited?: number;
  status?: EDepositStatus;
  name?: string;
  notes?: string;
}
