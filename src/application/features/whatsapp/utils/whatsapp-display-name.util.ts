export interface WhatsAppMessagingReadinessInput {
  metaPhoneStatus?: string;
  displayNameStatus?: string;
  displayPhoneNumber?: string;
}

export interface WhatsAppMessagingReadiness {
  canSendMessages: boolean;
  messagingBlockReason?: string;
}

/** Meta-provided +1 555 test numbers from Embedded Signup. */
export function isMetaProvided555Number(displayPhoneNumber?: string): boolean {
  if (!displayPhoneNumber) {
    return false;
  }

  const digits = displayPhoneNumber.replace(/\D/g, '');
  return digits.startsWith('1555');
}

export function evaluateWhatsAppMessagingReadiness(
  input: WhatsAppMessagingReadinessInput,
): WhatsAppMessagingReadiness {
  const metaPhoneStatus = input.metaPhoneStatus?.toUpperCase();
  const displayNameStatus = input.displayNameStatus?.toUpperCase();

  if (metaPhoneStatus && metaPhoneStatus !== 'CONNECTED') {
    return {
      canSendMessages: false,
      messagingBlockReason:
        'This phone number is not registered on WhatsApp Cloud API yet. Complete registration in Meta WhatsApp Manager.',
    };
  }

  if (displayNameStatus === 'APPROVED') {
    return { canSendMessages: true };
  }

  if (isMetaProvided555Number(input.displayPhoneNumber)) {
    if (displayNameStatus === 'AVAILABLE_WITHOUT_REVIEW' || displayNameStatus === 'NONE' || !displayNameStatus) {
      return {
        canSendMessages: false,
        messagingBlockReason:
          'Meta test numbers (+1 555) require an approved display name before sending. In WhatsApp Manager, open Phone numbers, edit the display name, and submit it for review.',
      };
    }

    if (displayNameStatus === 'PENDING_REVIEW') {
      return {
        canSendMessages: false,
        messagingBlockReason:
          'Display name is pending Meta review. Messaging unlocks automatically once the name is approved.',
      };
    }

    if (displayNameStatus === 'DECLINED' || displayNameStatus === 'EXPIRED') {
      return {
        canSendMessages: false,
        messagingBlockReason:
          'Display name was rejected or expired. Resubmit a compliant display name in WhatsApp Manager.',
      };
    }

    return {
      canSendMessages: false,
      messagingBlockReason:
        'Meta test numbers (+1 555) need an approved display name before messages can be sent.',
    };
  }

  if (displayNameStatus === 'AVAILABLE_WITHOUT_REVIEW') {
    return { canSendMessages: true };
  }

  if (displayNameStatus === 'DECLINED' || displayNameStatus === 'EXPIRED') {
    return {
      canSendMessages: false,
      messagingBlockReason:
        'Display name was rejected or expired. Resubmit a compliant display name in WhatsApp Manager.',
    };
  }

  return { canSendMessages: true };
}
