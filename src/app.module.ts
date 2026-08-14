import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { DEFAULT_THROTTLE_REQ_LIMIT, DEFAULT_THROTTLE_TTL, GlobalResponseInterceptor } from '@shared-libs';
import { LoggerModule, Params } from 'nestjs-pino';

import { ApplicationModule } from './application';
import { configFactory, IMsConfig } from './configurations';
import { InfrastructureModule } from './infrastructure';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configFactory],
      isGlobal: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<IMsConfig>) => configService.get<Params>('logger'),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: DEFAULT_THROTTLE_TTL,
        limit: DEFAULT_THROTTLE_REQ_LIMIT,
      },
    ]),
    ApplicationModule,
    InfrastructureModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: GlobalResponseInterceptor,
    },
  ],
})
export class AppModule {}
