import { SqlExecutor } from './log-tables';
import {
  EWhatsAppMessageDeliveryStatus,
  shouldAdvanceWhatsAppMessageStatus,
  type UpdateWhatsAppMessageStatusData,
} from '../../../application';

/** Outbox entry (stream whatsapp_status): a status webhook to apply once the logs database is reachable again. */
export interface WhatsAppStatusOp {
  id: string;
  createdAt: string;
  metaMessageId: string;
  update: UpdateWhatsAppMessageStatusData;
}

/** A whatsapp_messages row as read back (same table shape in the logs and the main database). */
export interface WhatsAppMessageRecord {
  id: string;
  userId: string;
  wabaId: string;
  phoneNumberId: string;
  metaMessageId: string;
  recipient: string;
  messageType: string | null;
  templateName: string | null;
  contextType: string | null;
  contextId: string | null;
  contextLabel: string | null;
  deliveryStatus: EWhatsAppMessageDeliveryStatus;
  statusTimestamp: string | null;
  errorCode: number | null;
  errorTitle: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const WHATSAPP_SELECT = `
  SELECT id, user_id AS "userId", waba_id AS "wabaId", phone_number_id AS "phoneNumberId",
         meta_message_id AS "metaMessageId", recipient, message_type AS "messageType",
         template_name AS "templateName", context_type AS "contextType", context_id AS "contextId",
         context_label AS "contextLabel", delivery_status AS "deliveryStatus", status_timestamp AS "statusTimestamp",
         error_code AS "errorCode", error_title AS "errorTitle", error_message AS "errorMessage",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM whatsapp_messages`;

export async function findWhatsAppMessage(
  executor: SqlExecutor,
  metaMessageId: string,
  userId?: string,
): Promise<WhatsAppMessageRecord | null> {
  const rows = (await executor.query(
    userId
      ? `${WHATSAPP_SELECT} WHERE meta_message_id = $1 AND user_id = $2::uuid`
      : `${WHATSAPP_SELECT} WHERE meta_message_id = $1`,
    userId ? [metaMessageId, userId] : [metaMessageId],
  )) as WhatsAppMessageRecord[];
  return rows[0] ?? null;
}

/**
 * Applies a delivery-status webhook exactly like the main-database repository did: never downgrades the status
 * (shouldAdvanceWhatsAppMessageStatus), sets the timestamp only when given, and on failure sets the error details
 * that were given (missing ones are kept). Returns the row as it now is, or null when the message is not in this
 * database. The update is guarded on the values it read, so concurrent webhooks for one message cannot overwrite each
 * other: on a clash it re-reads and decides again.
 */
export async function applyWhatsAppStatus(
  executor: SqlExecutor,
  metaMessageId: string,
  update: UpdateWhatsAppMessageStatusData,
): Promise<WhatsAppMessageRecord | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row = await findWhatsAppMessage(executor, metaMessageId);
    if (!row) return null;
    if (!shouldAdvanceWhatsAppMessageStatus(row.deliveryStatus, update.deliveryStatus)) return row;

    const failed = update.deliveryStatus === EWhatsAppMessageDeliveryStatus.Failed;
    const next = {
      deliveryStatus: update.deliveryStatus,
      statusTimestamp: update.statusTimestamp ? update.statusTimestamp : row.statusTimestamp,
      errorCode: failed && update.errorCode !== undefined ? update.errorCode : row.errorCode,
      errorTitle: failed && update.errorTitle !== undefined ? update.errorTitle : row.errorTitle,
      errorMessage: failed && update.errorMessage !== undefined ? update.errorMessage : row.errorMessage,
    };
    const unchanged =
      next.deliveryStatus === row.deliveryStatus &&
      next.statusTimestamp === row.statusTimestamp &&
      next.errorCode === row.errorCode &&
      next.errorTitle === row.errorTitle &&
      next.errorMessage === row.errorMessage;
    if (unchanged) return row;

    // Wrapped in a CTE so the statement is a SELECT: TypeORM returns [rows, rowCount] for a bare UPDATE.
    const updated = (await executor.query(
      `WITH changed AS (
         UPDATE whatsapp_messages
         SET delivery_status = $2, status_timestamp = $3, error_code = $4::int, error_title = $5, error_message = $6,
             updated_at = now()
         WHERE id = $1::uuid
           AND (delivery_status, status_timestamp, error_code, error_title, error_message)
               IS NOT DISTINCT FROM ($7::varchar, $8::varchar, $9::int, $10::varchar, $11::text)
         RETURNING id
       )
       SELECT id FROM changed`,
      [
        row.id,
        next.deliveryStatus,
        next.statusTimestamp,
        next.errorCode,
        next.errorTitle,
        next.errorMessage,
        row.deliveryStatus,
        row.statusTimestamp,
        row.errorCode,
        row.errorTitle,
        row.errorMessage,
      ],
    )) as unknown[];
    if (Array.isArray(updated) && updated.length > 0) return findWhatsAppMessage(executor, metaMessageId);
    // Another webhook changed it in between: read again and re-apply the rules.
  }
  return findWhatsAppMessage(executor, metaMessageId);
}
