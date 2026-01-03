import { JwtService } from '@nestjs/jwt';
import { UsersController } from './users';
import { AuthController } from './auth';
import { CustomersController } from './customers';

export * from './users';
export * from './auth';
export * from './customers';

export const Controllers = [UsersController, AuthController, CustomersController];

export const Services = [JwtService];
