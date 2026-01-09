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
  LOAN_SERVICE,
  LoanService,
  TRANSACTION_SERVICE,
  TransactionService,
  USERS_SERVICE,
  UsersService,
} from './features';

@Global()
@Module({
  imports: [JwtModule, PassportModule, ConfigModule],
  controllers: [...Controllers],
  providers: [
    ...Services,
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
      provide: TRANSACTION_SERVICE,
      useClass: TransactionService,
    },
    {
      provide: USERS_SERVICE,
      useClass: UsersService,
    },
  ],
  exports: [PassportModule, UserJwtStrategy, TRANSACTION_SERVICE],
})
export class ApplicationModule {}
