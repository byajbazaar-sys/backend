import { JwtService } from '@nestjs/jwt';
import { UsersController } from './users';
import { AuthController } from './auth';
import { CustomersController } from './customers';
import { LoansController } from './loans';

export * from './users';
export * from './auth';
export * from './customers';
export * from './loans';

export const Controllers = [UsersController, AuthController, CustomersController, LoansController];

export const Services = [JwtService];
