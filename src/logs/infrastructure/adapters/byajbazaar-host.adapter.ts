import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Paged } from '@shared-libs';
import { DataSource, EntityManager } from 'typeorm';

import type { BillLog, BillLogsQuery, CreateTransactionLogInput, TransactionLog } from '../../../application';
import {
  TransactionalContext,
  BillLogsRepository,
  TransactionLogsRepository,
  WhatsAppMessagesRepository,
} from '../../../infrastructure';
import { ILogsHost } from '../host';

/** Plugs the main database, its transactions and the pre-logs-service log tables into the logs service. */
@Injectable()
export class ByajBazaarLogsHostAdapter implements ILogsHost {
  constructor(
    @InjectDataSource() readonly mainDataSource: DataSource,
    private readonly billLogs: BillLogsRepository,
    private readonly transactionLogs: TransactionLogsRepository,
    private readonly whatsappMessages: WhatsAppMessagesRepository,
  ) {}

  activeTransaction(): EntityManager | undefined {
    return TransactionalContext.getManager();
  }

  afterCommit(callback: () => Promise<void>): Promise<void> {
    return TransactionalContext.afterCommit(callback);
  }

  async userNames(userIds: string[]): Promise<Map<string, string | null>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    const names = new Map<string, string | null>();
    if (ids.length === 0) return names;
    const rows = await this.mainDataSource.query<{ id: string; firstName: string | null; lastName: string | null }[]>(
      `SELECT id, first_name AS "firstName", last_name AS "lastName"
       FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [ids],
    );
    for (const row of rows) {
      names.set(row.id, [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null);
    }
    return names;
  }

  readonly legacy = {
    createBillLog: async (log: BillLog): Promise<void> => {
      await this.billLogs.create(log);
    },
    findBillLogs: (query: BillLogsQuery): Promise<Paged<BillLog>> => this.billLogs.find(query),
    createTransactionLog: async (input: CreateTransactionLogInput): Promise<void> => {
      await this.transactionLogs.create(input);
    },
    findTransactionLogs: (transactionId: string, createdBy: string): Promise<TransactionLog[]> =>
      this.transactionLogs.findByTransactionId(transactionId, createdBy),
    whatsapp: this.whatsappMessages,
  };
}
