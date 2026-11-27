import { AiActionView, AiPendingAction, EAiActionStatus } from '../domain';

/** A stored action as the apps see it; an unconfirmed preview past its expiry shows as EXPIRED. */
export function toActionView(action: AiPendingAction, now = new Date()): AiActionView {
  const expired = action.status === EAiActionStatus.AwaitingConfirmation && action.expiresAt.getTime() <= now.getTime();
  return {
    id: action.id,
    action: action.action,
    intent: action.intent,
    status: expired ? EAiActionStatus.Expired : action.status,
    preview: action.preview,
    payloadHash: action.payloadHash,
    expiresAt: action.expiresAt.toISOString(),
    createdAt: action.createdAt.toISOString(),
    result: action.result ? { summary: action.result.summary, card: action.result.card } : null,
    error: action.error ?? null,
  };
}
