import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserJwtStrategy, UsersAuthOptions } from '@shared-libs';

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
  POS_SESSION_SERVICE,
  PosSessionService,
  WEBSOCKET_HANDLER_SERVICE,
  WebSocketHandlerService,
  SALES_BILL_SERVICE,
  SalesBillService,
} from './features';
import {
  EMAIL_TEMPLATE_SERVICE,
  EmailTemplateService,
} from './features/notifications';

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
  ],
  exports: [PassportModule, UserJwtStrategy, TRANSACTION_SERVICE, LOAN_SERVICE],
})
export class ApplicationModule {}
