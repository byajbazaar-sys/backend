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
  PosSessionsController,
  PosSessionPublicController,
} from './inventory';

export * from './users';
export * from './auth';
export * from './customers';
export * from './loans';
export * from './transactions';
export * from './items';
export * from './notifications';
export * from './support';
export * from './inventory';

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
];

export const Services = [JwtService];
