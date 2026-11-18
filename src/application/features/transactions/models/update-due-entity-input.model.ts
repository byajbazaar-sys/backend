import { EDueType } from '../../../shared';

export interface UpdateDueEntityInput {
  type?: EDueType;
  dueDate?: Date;
  loanId?: string;
  dueAmount?: number;
  customerId?: string;
  principalAmount?: number;
  interestAmount?: number;
}
