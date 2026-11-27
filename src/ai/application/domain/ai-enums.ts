/** What the person wants done. Derived from the tool the model picked (never trusted from the model itself). */
export enum EAiIntent {
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
  Search = 'SEARCH',
  Query = 'QUERY',
  Calculate = 'CALCULATE',
  Report = 'REPORT',
  Navigate = 'NAVIGATE',
  Explain = 'EXPLAIN',
  Unknown = 'UNKNOWN',
}

/**
 * Lifecycle of a write action the assistant prepared:
 * PROPOSED → VALIDATED → AWAITING_CONFIRMATION → APPROVED → EXECUTING → COMPLETED / FAILED
 * (or CANCELLED by the person, EXPIRED when not confirmed in time). The row is stored once it is validated, so the
 * first state on disk is AWAITING_CONFIRMATION; every transition is also written to the audit log.
 */
export enum EAiActionStatus {
  Proposed = 'PROPOSED',
  Validated = 'VALIDATED',
  AwaitingConfirmation = 'AWAITING_CONFIRMATION',
  Approved = 'APPROVED',
  Executing = 'EXECUTING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
  Expired = 'EXPIRED',
}

export const FINAL_ACTION_STATUSES: readonly EAiActionStatus[] = [
  EAiActionStatus.Completed,
  EAiActionStatus.Failed,
  EAiActionStatus.Cancelled,
  EAiActionStatus.Expired,
];

/** Audit events (ai_audit_logs). Never contains message text — only what happened, to what, and by whom. */
export enum EAiAuditEvent {
  ChatTurn = 'CHAT_TURN',
  ToolExecuted = 'TOOL_EXECUTED',
  ToolRejected = 'TOOL_REJECTED',
  ToolDenied = 'TOOL_DENIED',
  ToolFailed = 'TOOL_FAILED',
  ActionProposed = 'ACTION_PROPOSED',
  ActionApproved = 'ACTION_APPROVED',
  ActionCompleted = 'ACTION_COMPLETED',
  ActionFailed = 'ACTION_FAILED',
  ActionCancelled = 'ACTION_CANCELLED',
  ActionExpired = 'ACTION_EXPIRED',
  ActionRefused = 'ACTION_REFUSED',
  ModelRefusal = 'MODEL_REFUSAL',
  ModelError = 'MODEL_ERROR',
  ConversationDeleted = 'CONVERSATION_DELETED',
  KnowledgeReindexed = 'KNOWLEDGE_REINDEXED',
  VoiceSessionStarted = 'VOICE_SESSION_STARTED',
  VoiceSessionEnded = 'VOICE_SESSION_ENDED',
  VoiceTurnRefused = 'VOICE_TURN_REFUSED',
}
