import { EDepositStatus } from '../enums';
import { Expose, Type } from 'class-transformer';
import { DepositTransaction } from './deposit-transaction';

export class DepositAccount {
  @Expose()
  id?: string;

  @Expose()
  depositNumber?: string;

  @Expose()
  customerId?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  name?: string;

  @Expose()
  @Type(() => Number)
  currentBalance?: number;

  @Expose()
  @Type(() => Number)
  totalDeposited?: number;

  @Expose()
  status?: EDepositStatus;

  @Expose()
  notes?: string;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  @Type(() => Date)
  updatedAt?: Date;

  @Expose()
  customerFirstName?: string;

  @Expose()
  customerLastName?: string;

  @Expose()
  customerPhone?: string;

  @Expose()
  @Type(() => DepositTransaction)
  transactions?: DepositTransaction[];
}
