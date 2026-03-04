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
  ITEM_SERVICE,
  ItemService,
  LOAN_SERVICE,
  LoanService,
  NOTIFICATION_SERVICE,
  NotificationService,
  TRANSACTION_SERVICE,
  TransactionService,
  USERS_SERVICE,
  UsersService,
} from './features';
import {
  EMAIL_TEMPLATE_SERVICE,
  EmailTemplateService,
} from './features/notifications';

@Global()
@Module({
  imports: [JwtModule, PassportModule, ConfigModule],
  controllers: [...Controllers],
  providers: [
    ...Services,
    {
      provide: EMAIL_TEMPLATE_SERVICE,
      useClass: EmailTemplateService,
    },
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
      provide: ITEM_SERVICE,
      useClass: ItemService,
    },
    {
      provide: TRANSACTION_SERVICE,
      useClass: TransactionService,
    },
    {
      provide: NOTIFICATION_SERVICE,
      useClass: NotificationService,
    },
    {
      provide: USERS_SERVICE,
      useClass: UsersService,
    },
  ],
  exports: [PassportModule, UserJwtStrategy, TRANSACTION_SERVICE],
})
export class ApplicationModule {}
