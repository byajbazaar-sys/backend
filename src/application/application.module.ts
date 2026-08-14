import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  UserJwtStrategy,
  UsersAuthOptions,
  JwtAuthenticationProvider,
  AUTHENTICATION_ORCHESTRATOR,
  UserAuthGuard,
  SUBSCRIPTION_ACCESS_CHECKER,
} from '@shared-libs';

import { IMsConfig } from '../configurations';
import {
  Controllers,
  Services,
  AUTH_SERVICE,
  AuthService,
  CUSTOMER_SERVICE,
  CustomerService,
  ITEM_SERVICE,
  ItemService,
  LOAN_SERVICE,
  LoanService,
  NOTIFICATION_SERVICE,
  NotificationService,
  SUPPORT_SERVICE,
  SupportService,
  TRANSACTION_SERVICE,
  TransactionService,
  LoanReplayService,
  USERS_SERVICE,
  UsersService,
  INVENTORY_CATEGORY_SERVICE,
  InventoryCategoryService,
  INVENTORY_ITEM_SERVICE,
  InventoryItemService,
  BARCODE_SERVICE,
  BarcodeService,
  INVENTORY_REPORT_SERVICE,
  InventoryReportService,
  SALES_BILL_SERVICE,
  SalesBillService,
  METAL_RATE_SERVICE,
  MetalRateService,
  API_AUTH_SERVICE,
  ApiAuthService,
  ApiAccessAuthenticationProvider,
  AuthenticationOrchestrator,
  PAYMENTS_SERVICE,
  PaymentsService,
  RAZORPAY_SERVICE,
  RazorpayService,
  COUPON_SERVICE,
  CouponService,
  WEBHOOK_SERVICE,
  WebhookService,
  SubscriptionAccessChecker,
  PlanService,
  PLAN_SERVICE,
  SubscriptionAdminService,
  SUBSCRIPTION_ADMIN_SERVICE,
  REFUND_SERVICE,
  RefundService,
  JEWELLERY_EVENT_SERVICE,
  JewelleryEventService,
  TRY_ON_SERVICE,
  TryOnService,
  DEPOSIT_SERVICE,
  DepositService,
  PUBLIC_CATALOG_SERVICE,
  PublicCatalogService,
  INVENTORY_CATALOG_SERVICE,
  InventoryCatalogService,
} from './features';
import { EMAIL_TEMPLATE_SERVICE, EmailTemplateService } from './features/notifications';
import {
  POS_SESSION_SERVICE,
  PosSessionService,
  WEBSOCKET_HANDLER_SERVICE,
  WebSocketHandlerService,
} from './features/pos';

@Global()
@Module({
  imports: [JwtModule, PassportModule, ConfigModule],
  controllers: [...Controllers],
  providers: [
    ...Services,
    {
      provide: EMAIL_TEMPLATE_SERVICE,
      useClass: EmailTemplateService,
    },
    {
      provide: UsersAuthOptions,
      inject: [ConfigService],
      useFactory: (config: ConfigService<IMsConfig>): UsersAuthOptions => config.get<UsersAuthOptions>('userJwt'),
    },
    UserJwtStrategy,
    JwtAuthenticationProvider,
    ApiAccessAuthenticationProvider,
    UserAuthGuard,
    {
      provide: AUTHENTICATION_ORCHESTRATOR,
      useClass: AuthenticationOrchestrator,
    },
    {
      provide: AUTH_SERVICE,
      useClass: AuthService,
    },
    {
      provide: CUSTOMER_SERVICE,
      useClass: CustomerService,
    },
    {
      provide: LOAN_SERVICE,
      useClass: LoanService,
    },
    {
      provide: ITEM_SERVICE,
      useClass: ItemService,
    },
    LoanReplayService,
    {
      provide: TRANSACTION_SERVICE,
      useClass: TransactionService,
    },
    {
      provide: NOTIFICATION_SERVICE,
      useClass: NotificationService,
    },
    {
      provide: SUPPORT_SERVICE,
      useClass: SupportService,
    },
    {
      provide: USERS_SERVICE,
      useClass: UsersService,
    },
    {
      provide: INVENTORY_CATEGORY_SERVICE,
      useClass: InventoryCategoryService,
    },
    {
      provide: INVENTORY_ITEM_SERVICE,
      useClass: InventoryItemService,
    },
    {
      provide: BARCODE_SERVICE,
      useClass: BarcodeService,
    },
    {
      provide: INVENTORY_REPORT_SERVICE,
      useClass: InventoryReportService,
    },
    {
      provide: POS_SESSION_SERVICE,
      useClass: PosSessionService,
    },
    {
      provide: WEBSOCKET_HANDLER_SERVICE,
      useClass: WebSocketHandlerService,
    },
    {
      provide: SALES_BILL_SERVICE,
      useClass: SalesBillService,
    },
    {
      provide: METAL_RATE_SERVICE,
      useClass: MetalRateService,
    },
    {
      provide: API_AUTH_SERVICE,
      useClass: ApiAuthService,
    },
    {
      provide: RAZORPAY_SERVICE,
      useClass: RazorpayService,
    },
    {
      provide: COUPON_SERVICE,
      useClass: CouponService,
    },
    {
      provide: WEBHOOK_SERVICE,
      useClass: WebhookService,
    },
    {
      provide: PAYMENTS_SERVICE,
      useClass: PaymentsService,
    },
    {
      provide: SUBSCRIPTION_ACCESS_CHECKER,
      useClass: SubscriptionAccessChecker,
    },
    {
      provide: PLAN_SERVICE,
      useClass: PlanService,
    },
    {
      provide: SUBSCRIPTION_ADMIN_SERVICE,
      useClass: SubscriptionAdminService,
    },
    {
      provide: REFUND_SERVICE,
      useClass: RefundService,
    },
    {
      provide: JEWELLERY_EVENT_SERVICE,
      useClass: JewelleryEventService,
    },
    {
      provide: TRY_ON_SERVICE,
      useClass: TryOnService,
    },
    {
      provide: DEPOSIT_SERVICE,
      useClass: DepositService,
    },
    {
      provide: PUBLIC_CATALOG_SERVICE,
      useClass: PublicCatalogService,
    },
    {
      provide: INVENTORY_CATALOG_SERVICE,
      useClass: InventoryCatalogService,
    },
  ],
  exports: [
    PassportModule,
    UserJwtStrategy,
    UserAuthGuard,
    AUTHENTICATION_ORCHESTRATOR,
    TRANSACTION_SERVICE,
    LOAN_SERVICE,
    PAYMENTS_SERVICE,
    JEWELLERY_EVENT_SERVICE,
    TRY_ON_SERVICE,
  ],
})
export class ApplicationModule {}
