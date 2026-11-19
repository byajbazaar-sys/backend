import { JwtService } from '@nestjs/jwt';

import { SettingsApiController } from './api-access';
import { AuthController } from './auth';
import { CloudflareAccountsAdminController, CloudflareAccountsAdminService } from './cloudflare-accounts';
import { CustomersController } from './customers';
import { DepositsController } from './deposits';
import { EventsController, AdminEventsController } from './events';
import {
  InventoryCategoriesController,
  InventoryItemsController,
  InventoryReportsController,
  InventoryCatalogController,
  BarcodeController,
} from './inventory';
import { ItemsController } from './items';
import { LabelDesignerSettingsController, LabelDesignerSettingsService } from './label-designer';
import { LoansController } from './loans';
import { MetalRatesController } from './metal-rates';
import { NotificationsController } from './notifications';
import { OrdersController } from './orders';
import { PaymentsController, AdminPaymentsController, CouponAdminService } from './payments';
import { PosSessionsController, PosSessionPublicController, PosSessionLeaveController } from './pos';
import { PublicCatalogController } from './public-catalog';
import { SalesBillsController } from './sales-bills';
import { SupportController } from './support';
import { TransactionsController } from './transactions';
import { TryOnController } from './try-on';
import { UsersController } from './users';
import { OtpChallengeService, VerificationController, VerificationService } from './verification';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp';

/** Controllers and extra providers of ApplicationModule. */
export const Controllers = [
  UsersController,
  AuthController,
  CustomersController,
  LoansController,
  TransactionsController,
  ItemsController,
  LabelDesignerSettingsController,
  NotificationsController,
  SupportController,
  InventoryCategoriesController,
  InventoryItemsController,
  InventoryReportsController,
  InventoryCatalogController,
  BarcodeController,
  PosSessionPublicController,
  PosSessionLeaveController,
  PosSessionsController,
  SalesBillsController,
  MetalRatesController,
  SettingsApiController,
  PaymentsController,
  AdminPaymentsController,
  AdminEventsController,
  EventsController,
  TryOnController,
  DepositsController,
  OrdersController,
  PublicCatalogController,
  WhatsAppController,
  WhatsAppWebhookController,
  VerificationController,
  CloudflareAccountsAdminController,
];

export const Services = [
  JwtService,
  LabelDesignerSettingsService,
  OtpChallengeService,
  VerificationService,
  CouponAdminService,
  CloudflareAccountsAdminService,
];
