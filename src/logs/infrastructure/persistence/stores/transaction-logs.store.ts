import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { v4 as uuid } from 'uuid';

import { CreateTransactionLogInput, ITransactionLogsRepository, TransactionLog } from '../../../../application';
import { ILogsHost, LOGS_HOST } from '../../host';
import { nextLogTimestamp, TransactionLogRow } from '../log-tables';
import { LogWriter } from '../log-writer';
import { LogsDatabase } from '../logs-database';
import { LogsModeService } from '../logs-mode.service';

/**
 * Transaction edit history (TRANSACTION_LOGS_REPOSITORY), stored by the logs service. Written inside the payment's
 * transaction, so a log exists exactly when the change it describes was committed.
 */
@Injectable()
export class TransactionLogsStore implements ITransactionLogsRepository {
  constructor(
    @Inject(LOGS_HOST) private readonly host: ILogsHost,
    private readonly db: LogsDatabase,
    private readonly mode: LogsModeService,
    private readonly writer: LogWriter,
  ) {}

  async create(input: CreateTransactionLogInput): Promise<TransactionLog> {
    const row: TransactionLogRow = {
      id: uuid(),
      transactionId: input.transactionId ?? null,
      loanId: input.loanId,
      userId: input.userId ?? input.performedBy ?? null,
      action: input.action,
      transactionType: input.transactionType ?? null,
      previousAmount: input.previousAmount ?? null,
      newAmount: input.newAmount ?? null,
      previousPaidIn: input.previousPaidIn ?? null,
      newPaidIn: input.newPaidIn ?? null,
      loanVersion: input.loanVersion ?? null,
      performedBy: input.performedBy,
      createdAt: nextLogTimestamp(),
    };
    await this.writer.write({
      stream: 'transaction',
      rows: [row],
      legacy: () => this.host.legacy.createTransactionLog(input),
    });
    return plainToInstance(
      TransactionLog,
      { ...row, createdAt: new Date(row.createdAt) },
      { excludeExtraneousValues: true },
    );
  }

  /** Oldest first. The caller has already checked that `createdBy` owns the transaction. */
  async findByTransactionId(transactionId: string, createdBy: string): Promise<TransactionLog[]> {
    if (!transactionId) return [];
    if ((await this.mode.of('transaction')) === 'legacy') {
      return this.host.legacy.findTransactionLogs(transactionId, createdBy);
    }
    const rows = await this.db.run((ds) =>
      ds.query<Record<string, unknown>[]>(
        `SELECT id, transaction_id AS "transactionId", loan_id AS "loanId", action,
                transaction_type AS "transactionType", previous_amount AS "previousAmount",
                new_amount AS "newAmount", previous_paid_in AS "previousPaidIn", new_paid_in AS "newPaidIn",
                loan_version AS "loanVersion", performed_by AS "performedBy", created_at AS "createdAt"
         FROM transaction_logs
         WHERE transaction_id = $1::uuid AND user_id = $2::uuid
         ORDER BY created_at ASC, id ASC`,
        [transactionId, createdBy],
      ),
    );
    return plainToInstance(TransactionLog, rows, { excludeExtraneousValues: true });
  }
}
