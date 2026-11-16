import { Inject, Injectable } from '@nestjs/common';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';

import {
  SaveWhatsAppOutboundMessageData,
  UpdateWhatsAppMessageStatusData,
  WhatsAppMessage,
} from '../../../../application/features/whatsapp/domain';
import { WhatsAppMessagesFilterOptions } from '../../../../application/features/whatsapp/options/whatsapp-messages-filter.options';
import { IWhatsAppMessagesRepository } from '../../../../application/features/whatsapp/service/i-whatsapp-messages.repository';
import { ILogsHost, LOGS_HOST } from '../../../application/ports/logs-host.ports';
import { LogOutbox } from '../log-outbox';
import { nextLogTimestamp, WhatsAppMessageRow } from '../log-tables';
import { LogWriter } from '../log-writer';
import { isConnectionError, LogsDatabase } from '../logs-database';
import { LogsModeService } from '../logs-mode.service';
import {
  applyWhatsAppStatus,
  findWhatsAppMessage,
  WHATSAPP_SELECT,
  WhatsAppMessageRecord,
  WhatsAppStatusOp,
} from '../whatsapp-messages.sql';

/**
 * WhatsApp message log (WHATSAPP_MESSAGES_REPOSITORY), stored by the logs service. Same results as the main-database
 * repository, which stays in use until the stream has been copied (and is the fallback without LOGS_DB_*).
 *  - Messages not copied yet are still found (and updated) in the main database.
 *  - A message Meta accepted is always recorded: if the logs database is unreachable it waits in the outbox.
 *  - A status webhook that arrives while the logs database is unreachable is queued in the outbox and applied later
 *    (the webhook then sees "unchanged" and skips the live update, nothing else).
 */
@Injectable()
export class WhatsAppMessagesStore implements IWhatsAppMessagesRepository {
  constructor(
    @Inject(LOGS_HOST) private readonly host: ILogsHost,
    private readonly db: LogsDatabase,
    private readonly mode: LogsModeService,
    private readonly writer: LogWriter,
    private readonly outbox: LogOutbox,
    @InjectPinoLogger(WhatsAppMessagesStore.name) private readonly logger: PinoLogger,
  ) {}

  private async inLogsDb(): Promise<boolean> {
    return (await this.mode.of('whatsapp')) === 'logs';
  }

  async createOutboundMessage(data: SaveWhatsAppOutboundMessageData): Promise<WhatsAppMessage> {
    if (!(await this.inLogsDb())) return this.host.legacy.whatsapp.createOutboundMessage(data);

    // Same idempotency as before: an already-recorded Meta message is returned as it is.
    const existing = await this.readLogsDb((ds) => findWhatsAppMessage(ds, data.metaMessageId));
    if (existing) return toMessage(existing);

    const now = nextLogTimestamp();
    const row: WhatsAppMessageRow = {
      id: uuid(),
      userId: data.userId,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      metaMessageId: data.metaMessageId,
      recipient: data.recipient,
      messageType: data.messageType ?? null,
      templateName: data.templateName ?? null,
      contextType: data.contextType ?? null,
      contextId: data.contextId ?? null,
      contextLabel: data.contextLabel ?? null,
      deliveryStatus: data.deliveryStatus ?? 'sent',
      statusTimestamp: data.statusTimestamp ?? null,
      errorCode: null,
      errorTitle: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    const fallback: { message?: WhatsAppMessage } = {};
    await this.writer.write({
      stream: 'whatsapp',
      rows: [row],
      joinTransaction: false,
      legacy: async () => {
        fallback.message = await this.host.legacy.whatsapp.createOutboundMessage(data);
      },
    });
    return (
      fallback.message ?? toMessage({ ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) })
    );
  }

  async findByMetaMessageId(metaMessageId: string): Promise<WhatsAppMessage | null> {
    if (!(await this.inLogsDb())) return this.host.legacy.whatsapp.findByMetaMessageId(metaMessageId);
    const row = await this.readLogsDb((ds) => findWhatsAppMessage(ds, metaMessageId));
    return row ? toMessage(row) : this.host.legacy.whatsapp.findByMetaMessageId(metaMessageId);
  }

  async findByUserIdAndMetaMessageId(userId: string, metaMessageId: string): Promise<WhatsAppMessage | null> {
    if (!(await this.inLogsDb())) {
      return this.host.legacy.whatsapp.findByUserIdAndMetaMessageId(userId, metaMessageId);
    }
    const row = await this.readLogsDb((ds) => findWhatsAppMessage(ds, metaMessageId, userId));
    return row ? toMessage(row) : this.host.legacy.whatsapp.findByUserIdAndMetaMessageId(userId, metaMessageId);
  }

  async applyStatusUpdate(
    metaMessageId: string,
    update: UpdateWhatsAppMessageStatusData,
  ): Promise<WhatsAppMessage | null> {
    if (!(await this.inLogsDb())) return this.host.legacy.whatsapp.applyStatusUpdate(metaMessageId, update);
    try {
      const row = await this.db.run((ds) => applyWhatsAppStatus(ds, metaMessageId, update));
      if (row) return toMessage(row);
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      await this.queueStatus(metaMessageId, update);
      return null;
    }
    // Not in the logs database: a message that has not been copied yet.
    return this.host.legacy.whatsapp.applyStatusUpdate(metaMessageId, update);
  }

  async listByUserId(options: WhatsAppMessagesFilterOptions): Promise<Paged<WhatsAppMessage>> {
    if (!(await this.inLogsDb())) return this.host.legacy.whatsapp.listByUserId(options);

    const { pageNumber, pageSize, skip } = getPaginationValues(options);
    const params: unknown[] = [options.userId];
    const where = ['user_id = $1::uuid'];
    if (options.recipient?.trim()) {
      params.push(`%${options.recipient.trim()}%`);
      where.push(`recipient LIKE $${params.length}`);
    }
    if (options.deliveryStatus) {
      params.push(options.deliveryStatus);
      where.push(`delivery_status = $${params.length}`);
    }
    if (options.contextType) {
      params.push(options.contextType);
      where.push(`context_type = $${params.length}`);
    }
    const filter = where.join(' AND ');
    const [rows, counted] = await this.db.run((ds) =>
      Promise.all([
        ds.query<WhatsAppMessageRecord[]>(
          `${WHATSAPP_SELECT} WHERE ${filter}
           ORDER BY created_at DESC, id DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, skip],
        ),
        ds.query<{ count: number }[]>(`SELECT count(*)::int AS "count" FROM whatsapp_messages WHERE ${filter}`, params),
      ]),
    );
    return toPaged(WhatsAppMessage, {
      items: rows.map((row) => toMessage(row)),
      page: pageNumber,
      perPage: pageSize,
      totalCount: counted[0]?.count ?? 0,
    });
  }

  /** Logs-database read that treats "unreachable" as "not found here" (callers then look in the main database). */
  private async readLogsDb<T>(read: (ds: DataSource) => Promise<T>): Promise<T | null> {
    try {
      return await this.db.run(read);
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      this.logger.warn({ err }, 'Logs database unreachable; looking up the WhatsApp message in the main database');
      return null;
    }
  }

  private async queueStatus(metaMessageId: string, update: UpdateWhatsAppMessageStatusData): Promise<void> {
    const op: WhatsAppStatusOp = { id: uuid(), createdAt: nextLogTimestamp(), metaMessageId, update: { ...update } };
    if (await this.outbox.isReady()) {
      await this.outbox.add(this.host.mainDataSource, 'whatsapp_status', [op]);
      this.logger.warn({ metaMessageId }, 'Logs database unreachable; WhatsApp status update queued');
      return;
    }
    // No outbox table yet (deploy window): best effort on the main-database row.
    await this.host.legacy.whatsapp.applyStatusUpdate(metaMessageId, update);
  }
}

function toMessage(
  row: WhatsAppMessageRecord | (Omit<WhatsAppMessageRecord, 'deliveryStatus'> & { deliveryStatus: string }),
): WhatsAppMessage {
  return plainToInstance(WhatsAppMessage, row, { excludeExtraneousValues: true });
}
