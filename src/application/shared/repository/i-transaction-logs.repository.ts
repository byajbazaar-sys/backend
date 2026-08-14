import { CreateTransactionLogInput, TransactionLog } from '../../features/transactions/domain';

export const TRANSACTION_LOGS_REPOSITORY = 'ITransactionLogsRepository';

export interface ITransactionLogsRepository {
  create(input: CreateTransactionLogInput): Promise<TransactionLog>;
  findByTransactionId(transactionId: string, createdBy: string): Promise<TransactionLog[]>;
}
