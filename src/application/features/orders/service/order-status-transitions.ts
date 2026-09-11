import { EOrderStatus } from '../enums';

export const ORDER_STATUS_TRANSITIONS: Record<EOrderStatus, EOrderStatus[]> = {
  [EOrderStatus.NEW]: [EOrderStatus.CONFIRMED, EOrderStatus.ON_HOLD, EOrderStatus.CANCELLED],
  [EOrderStatus.CONFIRMED]: [EOrderStatus.IN_PROGRESS, EOrderStatus.ON_HOLD, EOrderStatus.CANCELLED],
  [EOrderStatus.IN_PROGRESS]: [EOrderStatus.READY, EOrderStatus.ON_HOLD, EOrderStatus.CANCELLED],
  [EOrderStatus.READY]: [EOrderStatus.DELIVERED, EOrderStatus.ON_HOLD, EOrderStatus.CANCELLED],
  [EOrderStatus.DELIVERED]: [EOrderStatus.COMPLETED, EOrderStatus.CANCELLED],
  [EOrderStatus.ON_HOLD]: [
    EOrderStatus.NEW,
    EOrderStatus.CONFIRMED,
    EOrderStatus.IN_PROGRESS,
    EOrderStatus.READY,
    EOrderStatus.CANCELLED,
  ],
  [EOrderStatus.COMPLETED]: [],
  [EOrderStatus.CANCELLED]: [],
};

export function isValidStatusTransition(from: EOrderStatus, to: EOrderStatus): boolean {
  if (from === to) return true;
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalOrderStatus(status: EOrderStatus): boolean {
  return status === EOrderStatus.COMPLETED || status === EOrderStatus.CANCELLED;
}

export function isOrderOverdue(status: EOrderStatus, dueDate?: Date | null, now = new Date()): boolean {
  if (!dueDate || isTerminalOrderStatus(status) || status === EOrderStatus.DELIVERED) {
    return false;
  }
  return dueDate.getTime() < now.getTime();
}
