export const LOGS_TRANSACTION = 'LOGS_TRANSACTION';

/** The caller's main-database transaction, as far as log writers need it. */
export interface ILogsTransaction {
  /** Runs `callback` after the active transaction commits (never on rollback), or right away without one. */
  afterCommit(callback: () => Promise<void>): Promise<void>;
}
