import { Expose } from 'class-transformer';

import { EWhatsAppConnectionStatus } from '../enums';

export class WhatsAppBusinessConnection {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  wabaId: string;

  @Expose()
  phoneNumberId: string;

  @Expose()
  displayPhoneNumber?: string;

  @Expose()
  businessName?: string;

  @Expose()
  connectionStatus: EWhatsAppConnectionStatus;

  @Expose()
  dueRemindersEnabled: boolean;

  @Expose()
  reengagementTemplateName?: string;

  @Expose()
  reengagementTemplateLanguage?: string;

  /** Live Meta Cloud API registration status for the connected phone number (e.g. CONNECTED). */
  @Expose()
  metaPhoneStatus?: string;

  /** Live Meta display-name review status (e.g. APPROVED, PENDING_REVIEW). */
  @Expose()
  displayNameStatus?: string;

  /** Live Meta verified display name for the connected phone number. */
  @Expose()
  verifiedDisplayName?: string;

  @Expose()
  codeVerificationStatus?: string;

  @Expose()
  canSendMessages?: boolean;

  @Expose()
  messagingBlockReason?: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
