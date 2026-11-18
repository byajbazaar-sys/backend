import { ApiAccessTokenEntity } from './api-access-token.entity';
import { ApiConfigurationEntity } from './api-configuration.entity';
import { BillLogEntity } from './bill-log.entity';
import { CouponRedemptionEntity } from './coupon-redemption.entity';
import { CouponEntity } from './coupon.entity';
import { CustomerEntity } from './customer.entity';
import { DepositAccountEntity } from './deposit-account.entity';
import { DepositReceiptEntity } from './deposit-receipt.entity';
import { DepositTransactionEntity } from './deposit-transaction.entity';
import { DueEntity } from './due.entity';
import { InventoryCategoryEntity } from './inventory-category.entity';
import { InventoryItemEntity } from './inventory-item.entity';
import { ItemEntity } from './item.entity';
import { JewelleryEventEntity } from './jewellery-event.entity';
import { LabelDesignerSettingsEntity } from './label-designer-settings.entity';
import { LoanItemEntity } from './loan-item.entity';
import { LoanEntity } from './loan.entity';
import { MetalRateEntity } from './metal-rate.entity';
import { NotificationEntity } from './notification.entity';
import { OrderActivityEntity } from './order-activity.entity';
import { OrderAttachmentEntity } from './order-attachment.entity';
import { OrderEntity } from './order.entity';
import { PaymentEventEntity } from './payment-event.entity';
import { PaymentOrderEntity } from './payment-order.entity';
import { PaymentEntity } from './payment.entity';
import { PlanEntity } from './plan.entity';
import { PosSessionEntity } from './pos-session.entity';
import { RefundEntity } from './refund.entity';
import { SalesBillItemEntity } from './sales-bill-item.entity';
import { SalesBillEntity } from './sales-bill.entity';
import { SeedEntity } from './seed.entity';
import { SubscriptionEntity } from './subscription.entity';
import { SupportRequestEntity } from './support-request.entity';
import { TransactionLogEntity } from './transaction-log.entity';
import { TransactionEntity } from './transaction.entity';
import { TryOnAssetEntity } from './try-on-asset.entity';
import { UserEntity } from './user.entity';
import { WebSocketConnectionEntity } from './websocket-connection.entity';
import { WhatsAppBusinessConnectionEntity } from './whatsapp-business-connection.entity';
import { WhatsAppConversationWindowEntity } from './whatsapp-conversation-window.entity';
import { WhatsAppMessageEntity } from './whatsapp-message.entity';

/** Every TypeORM entity of the main database. */
export const ENTITIES = [
  UserEntity,
  CustomerEntity,
  LoanEntity,
  LoanItemEntity,
  ItemEntity,
  TransactionEntity,
  DueEntity,
  NotificationEntity,
  SeedEntity,
  SupportRequestEntity,
  InventoryCategoryEntity,
  InventoryItemEntity,
  PosSessionEntity,
  WebSocketConnectionEntity,
  SalesBillEntity,
  BillLogEntity,
  SalesBillItemEntity,
  MetalRateEntity,
  ApiConfigurationEntity,
  ApiAccessTokenEntity,
  CouponEntity,
  SubscriptionEntity,
  PaymentOrderEntity,
  PaymentEntity,
  PaymentEventEntity,
  CouponRedemptionEntity,
  RefundEntity,
  PlanEntity,
  JewelleryEventEntity,
  LabelDesignerSettingsEntity,
  TryOnAssetEntity,
  DepositAccountEntity,
  DepositTransactionEntity,
  DepositReceiptEntity,
  OrderEntity,
  OrderActivityEntity,
  OrderAttachmentEntity,
  TransactionLogEntity,
  WhatsAppBusinessConnectionEntity,
  WhatsAppConversationWindowEntity,
  WhatsAppMessageEntity,
];
