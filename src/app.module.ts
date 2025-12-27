import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { createPinoHttpOptions, DEFAULT_THROTTLE_REQ_LIMIT, DEFAULT_THROTTLE_TTL, GlobalResponseInterceptor, type Environment } from '@shared-libs';
import { LoggerModule } from 'nestjs-pino';

import { ApplicationModule} from './application';
import { configFactory, IMsConfig, IApiOptions } from './configurations';
import { InfrastructureModule } from './infrastructure';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configFactory],
      isGlobal: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<IMsConfig>) => {
        const api: IApiOptions = cfg.get<IApiOptions>('apiConfig');
        const env: Environment = api?.env ?? 'development';
        return { pinoHttp: createPinoHttpOptions(env) };
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: DEFAULT_THROTTLE_TTL,
        limit: DEFAULT_THROTTLE_REQ_LIMIT,
      },
    ]),
    ApplicationModule,
    InfrastructureModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: GlobalResponseInterceptor,
    },
  ],
})
export class AppModule {}
