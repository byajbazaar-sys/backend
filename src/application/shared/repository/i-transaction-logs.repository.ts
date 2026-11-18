import { CreateTransactionLogInput, TransactionLog } from '../../features';

export const TRANSACTION_LOGS_REPOSITORY = 'ITransactionLogsRepository';

export interface ITransactionLogsRepository {
  create(input: CreateTransactionLogInput): Promise<TransactionLog>;
  findByTransactionId(transactionId: string, createdBy: string): Promise<TransactionLog[]>;
}
