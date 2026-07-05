import { JwtService } from '@nestjs/jwt';
import { UsersController } from './users';
import { AuthController } from './auth';
import { CustomersController } from './customers';
import { LoansController } from './loans';
import { TransactionsController } from './transactions';
import { ItemsController } from './items';
import { NotificationsController } from './notifications';
import { SupportController } from './support';
import {
  InventoryCategoriesController,
  InventoryItemsController,
  InventoryReportsController,
  BarcodeController,
} from './inventory';
import { PosSessionsController, PosSessionPublicController } from './pos';
import { SalesBillsController } from './sales-bills';
import { MetalRatesController } from './metal-rates';
import { SettingsApiController } from './api-access';

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
  BarcodeController,
  PosSessionPublicController,
  PosSessionsController,
  SalesBillsController,
  MetalRatesController,
  SettingsApiController,
];

export const Services = [JwtService];
