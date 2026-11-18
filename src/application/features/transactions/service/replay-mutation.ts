/** How a replay should differ from the history currently on record. */
export type ReplayMutation =
  | { kind: 'none' }
  | { kind: 'delete'; transactionId: string }
  | { kind: 'editAmount'; transactionId: string; newAmount: number };
