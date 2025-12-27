import { JwtService } from '@nestjs/jwt';
import { UsersController } from './users';
import { JobsController } from './jobs';
import { AuthController } from './auth';
import { SmsController } from './sms';
import { CustomersController } from './customers';

export * from './users';
export * from './jobs';
export * from './auth';
export * from './sms';
export * from './customers';

export const Controllers = [UsersController, JobsController, AuthController, SmsController, CustomersController];

export const Services = [JwtService];
