import { JwtService } from '@nestjs/jwt';
import { UsersController } from './users';
import { AuthController } from './auth';
import { CustomersController } from './customers';
import { LoansController } from './loans';
import { TransactionsController } from './transactions';

export * from './users';
export * from './auth';
export * from './customers';
export * from './loans';
export * from './transactions';

export const Controllers = [UsersController, AuthController, CustomersController, LoansController, TransactionsController];

export const Services = [JwtService];
