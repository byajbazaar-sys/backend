import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserJwtStrategy, UsersAuthOptions } from '@shared-libs';

import { IMsConfig } from '../configurations';
import { Controllers, Services, AUTH_SERVICE, AuthService, CUSTOMER_SERVICE, CustomerService } from './features';

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
  ],
  exports: [PassportModule, UserJwtStrategy],
})
export class ApplicationModule {}
