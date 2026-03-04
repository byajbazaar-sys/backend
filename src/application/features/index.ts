import { JwtService } from '@nestjs/jwt';
import { UsersController } from './users';
import { AuthController } from './auth';
import { CustomersController } from './customers';
import { LoansController } from './loans';
import { TransactionsController } from './transactions';
import { ItemsController } from './items';
import { NotificationsController } from './notifications';

export * from './users';
export * from './auth';
export * from './customers';
export * from './loans';
export * from './transactions';
export * from './items';
export * from './notifications';

export const Controllers = [
  UsersController,
  AuthController,
  CustomersController,
  LoansController,
  TransactionsController,
  ItemsController,
  NotificationsController,
];

export const Services = [JwtService];
