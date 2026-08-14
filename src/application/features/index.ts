import { JwtService } from '@nestjs/jwt';

import { SettingsApiController } from './api-access';
import { AuthController } from './auth';
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
import { LoansController } from './loans';
import { MetalRatesController } from './metal-rates';
import { NotificationsController } from './notifications';
import { PaymentsController, AdminPaymentsController } from './payments';
import { PosSessionsController, PosSessionPublicController, PosSessionLeaveController } from './pos';
import { SupportController } from './support';
import { SalesBillsController } from './sales-bills';
import { TransactionsController } from './transactions';
import { TryOnController } from './try-on';
import { PublicCatalogController } from './public-catalog';
import { UsersController } from './users';

export * from './users';
export * from './auth';
export * from './customers';
export * from './loans';
export * from './transactions';
export * from './items';
export * from './notifications';
export * from './support';
export * from './inventory';
export * from './pos';
export * from './sales-bills';
export * from './metal-rates';
export * from './api-access';
export * from './payments';
export * from './events';
export * from './try-on';
export * from './deposits';
export * from './public-catalog';

export const Controllers = [
  UsersController,
  AuthController,
  CustomersController,
  LoansController,
  TransactionsController,
  ItemsController,
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
  PublicCatalogController,
  InventoryCatalogController,
];

export const Services = [JwtService];
