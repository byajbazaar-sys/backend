export enum EWhatsAppMessageDeliveryStatus {
  Sent = 'sent',
  Delivered = 'delivered',
  Read = 'read',
  Failed = 'failed',
}

const STATUS_RANK: Record<EWhatsAppMessageDeliveryStatus, number> = {
  [EWhatsAppMessageDeliveryStatus.Sent]: 1,
  [EWhatsAppMessageDeliveryStatus.Delivered]: 2,
  [EWhatsAppMessageDeliveryStatus.Read]: 3,
  [EWhatsAppMessageDeliveryStatus.Failed]: 4,
};

export function parseWhatsAppMessageDeliveryStatus(value: string | undefined): EWhatsAppMessageDeliveryStatus | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  switch (normalized) {
    case EWhatsAppMessageDeliveryStatus.Sent:
    case EWhatsAppMessageDeliveryStatus.Delivered:
    case EWhatsAppMessageDeliveryStatus.Read:
    case EWhatsAppMessageDeliveryStatus.Failed:
      return normalized as EWhatsAppMessageDeliveryStatus;
    default:
      return null;
  }
}

/** Never downgrade sent -> delivered -> read; failed is terminal when already failed. */
export function shouldAdvanceWhatsAppMessageStatus(
  current: EWhatsAppMessageDeliveryStatus,
  incoming: EWhatsAppMessageDeliveryStatus,
): boolean {
  if (current === incoming) {
    return true;
  }
  if (incoming === EWhatsAppMessageDeliveryStatus.Failed) {
    return true;
  }
  if (current === EWhatsAppMessageDeliveryStatus.Failed) {
    return false;
  }
  return STATUS_RANK[incoming] > STATUS_RANK[current];
}
