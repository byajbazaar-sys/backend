import { Paged } from '@shared-libs';
import { DataSource, EntityManager } from 'typeorm';

import type {
  BillLog,
  BillLogsQuery,
  CreateTransactionLogInput,
  TransactionLog,
  IWhatsAppMessagesRepository,
} from '../../../application';
import type { ILogsTransaction } from '../../application';

/**
 * What the logs service needs from the ByajBazaar app (main database). Logs code depends only on this interface; the
 * adapter in infrastructure/adapters plugs in the real ByajBazaar pieces.
 */
export const LOGS_HOST = 'LOGS_HOST';
export interface ILogsHost extends ILogsTransaction {
  /** The main database: outbox, legacy log tables, user names. */
  readonly mainDataSource: DataSource;
  /** The caller's active main-database transaction (UnitOfWork), if any. */
  activeTransaction(): EntityManager | undefined;
  /** "First Last" of active users, by id (soft-deleted users are left out, as the old join did). */
  userNames(userIds: string[]): Promise<Map<string, string | null>>;

  /** The pre-logs-service tables in the main database. Writes join the active transaction. */
  readonly legacy: {
    createBillLog(log: BillLog): Promise<void>;
    findBillLogs(query: BillLogsQuery): Promise<Paged<BillLog>>;
    createTransactionLog(input: CreateTransactionLogInput): Promise<void>;
    findTransactionLogs(transactionId: string, createdBy: string): Promise<TransactionLog[]>;
    /** The main database's whatsapp_messages (never joins a transaction: a sent message is always recorded). */
    whatsapp: IWhatsAppMessagesRepository;
  };
}
