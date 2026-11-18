export interface OrderNotificationResult {
  sent: boolean;
  channel: 'whatsapp';
  recipient?: string;
  reason?: string;
}
