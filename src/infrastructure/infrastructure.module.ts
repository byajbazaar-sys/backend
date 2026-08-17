import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AES_ENCRYPT_SERVICE, IDbOptions } from '@shared-libs';

import { AIOptions, AivotTryOnOptions, CloudflareTryOnOptions } from './ai';
import { WEBSOCKET_MESSAGE_SERVICE } from '../application';
import { CloudflareTryOnService } from './ai/services/cloudflare-try-on.service';
import {
  CUSTOMERS_REPOSITORY,
  DUES_REPOSITORY,
  EMAIL_SERVICE,
  FileStorageOptions,
  GOOGLE_OAUTH_SERVICE,
  GoogleOAuthOptions,
  ITEMS_REPOSITORY,
  LOAN_ITEMS_REPOSITORY,
  LOANS_REPOSITORY,
  NOTIFICATIONS_REPOSITORY,
  SUPPORT_REQUESTS_REPOSITORY,
  TRANSACTIONS_REPOSITORY,
  TRANSACTION_LOGS_REPOSITORY,
  USERS_FILE_STORAGE,
  USERS_REPOSITORY,
  INVENTORY_CATEGORIES_REPOSITORY,
  INVENTORY_ITEMS_REPOSITORY,
  POS_SESSIONS_REPOSITORY,
  WEBSOCKET_CONNECTIONS_REPOSITORY,
  SALES_BILLS_REPOSITORY,
  METAL_RATES_REPOSITORY,
  API_CONFIGURATION_REPOSITORY,
  API_ACCESS_TOKEN_REPOSITORY,
  SUBSCRIPTIONS_REPOSITORY,
  PAYMENT_ORDERS_REPOSITORY,
  PAYMENTS_REPOSITORY,
  PAYMENT_EVENTS_REPOSITORY,
  COUPONS_REPOSITORY,
  COUPON_REDEMPTIONS_REPOSITORY,
  REFUNDS_REPOSITORY,
  PLANS_REPOSITORY,
  JEWELLERY_EVENTS_REPOSITORY,
  TRY_ON_ASSETS_REPOSITORY,
  DEPOSITS_REPOSITORY,
  RazorpayOptions,
  TRY_ON_AI_SERVICE,
  TRY_ON_ORCHESTRATOR,
  PRODUCT_IMAGE_AI_SERVICE,
  REDIS_SERVICE,
  CACHE_SERVICE,
  UNIT_OF_WORK,
} from '../application';
import { ResendOptions, ResendService } from './resend';
import { WebAppOptions } from '../application';
import { AivotService } from './ai/services/aivot.service';
import { TryOnOrchestratorService } from './ai/services/try-on-orchestrator.service';
import CronServices from './cron';
import { AESEncrypt, AESEncryptOptions } from './crypto';
import { GoogleOAuthService } from './google-oauth';
import {
  UnitOfWork,
  CustomersRepository,
  DuesRepository,
  ItemsRepository,
  LoanItemsRepository,
  LoansRepository,
  NotificationsRepository,
  SupportRequestsRepository,
  TransactionsRepository,
  TransactionLogsRepository,
  UsersRepository,
  InventoryCategoriesRepository,
  InventoryItemsRepository,
  PosSessionsRepository,
  WebSocketConnectionsRepository,
  SalesBillsRepository,
  MetalRatesRepository,
  ApiConfigurationRepository,
  ApiAccessTokenRepository,
  SubscriptionsRepository,
  PaymentOrdersRepository,
  PaymentsRepository,
  PaymentEventsRepository,
  CouponsRepository,
  CouponRedemptionsRepository,
  RefundsRepository,
  PlansRepository,
  JewelleryEventsRepository,
  TryOnAssetsRepository,
  DepositsRepository,
} from './persistence';
import Entities from './persistence/entities';
import Seeds from './persistence/seeds';
import { generateDataSourceOptions } from './persistence/type-orm.config';
import { FileStorageMock, UsersFileStorage } from './s3';
import { WebSocketMessageService } from './websocket/websocket-message.service';
import { RedisOptions, RedisService, RedisCacheService } from './redis';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get<IDbOptions>('database');
        if (!dbConfig?.host) {
          throw new Error(
            'Database configuration is missing. Please set DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME environment variables.',
          );
        }
        return generateDataSourceOptions(dbConfig);
      },
    }),
    TypeOrmModule.forFeature([...Entities]),
  ],
  providers: [
    ...Seeds,
    ...CronServices,
    {
      provide: UNIT_OF_WORK,
      useClass: UnitOfWork,
    },
    {
      provide: USERS_REPOSITORY,
      useClass: UsersRepository,
    },
    {
      provide: CUSTOMERS_REPOSITORY,
      useClass: CustomersRepository,
    },
    {
      provide: LOANS_REPOSITORY,
      useClass: LoansRepository,
    },
    {
      provide: LOAN_ITEMS_REPOSITORY,
      useClass: LoanItemsRepository,
    },
    {
      provide: ITEMS_REPOSITORY,
      useClass: ItemsRepository,
    },
    {
      provide: TRANSACTIONS_REPOSITORY,
      useClass: TransactionsRepository,
    },
    {
      provide: TRANSACTION_LOGS_REPOSITORY,
      useClass: TransactionLogsRepository,
    },
    {
      provide: DUES_REPOSITORY,
      useClass: DuesRepository,
    },
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useClass: NotificationsRepository,
    },
    {
      provide: SUPPORT_REQUESTS_REPOSITORY,
      useClass: SupportRequestsRepository,
    },
    {
      provide: INVENTORY_CATEGORIES_REPOSITORY,
      useClass: InventoryCategoriesRepository,
    },
    {
      provide: INVENTORY_ITEMS_REPOSITORY,
      useClass: InventoryItemsRepository,
    },
    {
      provide: POS_SESSIONS_REPOSITORY,
      useClass: PosSessionsRepository,
    },
    {
      provide: WEBSOCKET_CONNECTIONS_REPOSITORY,
      useClass: WebSocketConnectionsRepository,
    },
    {
      provide: SALES_BILLS_REPOSITORY,
      useClass: SalesBillsRepository,
    },
    {
      provide: METAL_RATES_REPOSITORY,
      useClass: MetalRatesRepository,
    },
    {
      provide: API_CONFIGURATION_REPOSITORY,
      useClass: ApiConfigurationRepository,
    },
    {
      provide: API_ACCESS_TOKEN_REPOSITORY,
      useClass: ApiAccessTokenRepository,
    },
    {
      provide: SUBSCRIPTIONS_REPOSITORY,
      useClass: SubscriptionsRepository,
    },
    {
      provide: PAYMENT_ORDERS_REPOSITORY,
      useClass: PaymentOrdersRepository,
    },
    {
      provide: PAYMENTS_REPOSITORY,
      useClass: PaymentsRepository,
    },
    {
      provide: PAYMENT_EVENTS_REPOSITORY,
      useClass: PaymentEventsRepository,
    },
    {
      provide: COUPONS_REPOSITORY,
      useClass: CouponsRepository,
    },
    {
      provide: COUPON_REDEMPTIONS_REPOSITORY,
      useClass: CouponRedemptionsRepository,
    },
    {
      provide: REFUNDS_REPOSITORY,
      useClass: RefundsRepository,
    },
    {
      provide: PLANS_REPOSITORY,
      useClass: PlansRepository,
    },
    {
      provide: JEWELLERY_EVENTS_REPOSITORY,
      useClass: JewelleryEventsRepository,
    },
    {
      provide: TRY_ON_ASSETS_REPOSITORY,
      useClass: TryOnAssetsRepository,
    },
    {
      provide: DEPOSITS_REPOSITORY,
      useClass: DepositsRepository,
    },
    {
      provide: WEBSOCKET_MESSAGE_SERVICE,
      useClass: WebSocketMessageService,
    },
    {
      provide: AES_ENCRYPT_SERVICE,
      useClass: AESEncrypt,
    },
    {
      provide: AESEncryptOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new AESEncryptOptions(configService.get('aes').key, configService.get('aes').algorithm),
    },
    {
      provide: FileStorageOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new FileStorageOptions(
          configService.get('fileStorage').accessKeyId,
          configService.get('fileStorage').secretAccessKey,
          configService.get('fileStorage').bucket,
          configService.get('fileStorage').region,
          configService.get('fileStorage').endpoint,
        ),
    },
    {
      provide: AIOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('ai'),
    },
    {
      provide: AivotTryOnOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('aivotTryOn'),
    },
    {
      provide: CloudflareTryOnOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('cloudflareTryOn'),
    },
    {
      provide: GoogleOAuthOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new GoogleOAuthOptions(
          configService.get('googleOAuth').clientId,
          configService.get('googleOAuth').clientSecret,
          configService.get('googleOAuth').redirectUri,
        ),
    },
    {
      provide: RazorpayOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('razorpay'),
    },
    {
      provide: USERS_FILE_STORAGE,
      useClass: process.env.MOCK_STORAGE ? FileStorageMock : UsersFileStorage,
    },
    CloudflareTryOnService,
    AivotService,
    TryOnOrchestratorService,
    {
      provide: TRY_ON_ORCHESTRATOR,
      useExisting: TryOnOrchestratorService,
    },
    {
      provide: PRODUCT_IMAGE_AI_SERVICE,
      useExisting: CloudflareTryOnService,
    },
    {
      provide: TRY_ON_AI_SERVICE,
      inject: [AIOptions, AivotService, CloudflareTryOnService],
      useFactory: (options: AIOptions, aivot: AivotService, cloudflare: CloudflareTryOnService) => {
        if (options.tryOnProvider === 'aivot') return aivot;
        return cloudflare;
      },
    },
    {
      provide: ResendOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('resend'),
    },
    ResendService,
    {
      provide: WebAppOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('webApp'),
    },
    {
      provide: EMAIL_SERVICE,
      useExisting: ResendService,
    },
    {
      provide: GOOGLE_OAUTH_SERVICE,
      useClass: GoogleOAuthService,
    },
    {
      provide: RedisOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('redis'),
    },
    RedisService,
    {
      provide: REDIS_SERVICE,
      useExisting: RedisService,
    },
    RedisCacheService,
    {
      provide: CACHE_SERVICE,
      useExisting: RedisCacheService,
    },
  ],
  exports: [
    UNIT_OF_WORK,
    USERS_REPOSITORY,
    CUSTOMERS_REPOSITORY,
    LOANS_REPOSITORY,
    LOAN_ITEMS_REPOSITORY,
    ITEMS_REPOSITORY,
    AES_ENCRYPT_SERVICE,
    USERS_FILE_STORAGE,
    TRY_ON_AI_SERVICE,
    TRY_ON_ORCHESTRATOR,
    PRODUCT_IMAGE_AI_SERVICE,
    TRANSACTIONS_REPOSITORY,
    DUES_REPOSITORY,
    NOTIFICATIONS_REPOSITORY,
    SUPPORT_REQUESTS_REPOSITORY,
    INVENTORY_CATEGORIES_REPOSITORY,
    INVENTORY_ITEMS_REPOSITORY,
    POS_SESSIONS_REPOSITORY,
    WEBSOCKET_CONNECTIONS_REPOSITORY,
    SALES_BILLS_REPOSITORY,
    METAL_RATES_REPOSITORY,
    API_CONFIGURATION_REPOSITORY,
    API_ACCESS_TOKEN_REPOSITORY,
    SUBSCRIPTIONS_REPOSITORY,
    PAYMENT_ORDERS_REPOSITORY,
    PAYMENTS_REPOSITORY,
    PAYMENT_EVENTS_REPOSITORY,
    COUPONS_REPOSITORY,
    PLANS_REPOSITORY,
    JEWELLERY_EVENTS_REPOSITORY,
    TRY_ON_ASSETS_REPOSITORY,
    DEPOSITS_REPOSITORY,
    COUPON_REDEMPTIONS_REPOSITORY,
    REFUNDS_REPOSITORY,
    WEBSOCKET_MESSAGE_SERVICE,
    TRANSACTION_LOGS_REPOSITORY,
    EMAIL_SERVICE,
    GOOGLE_OAUTH_SERVICE,
    REDIS_SERVICE,
    CACHE_SERVICE,
    RedisOptions,
    FileStorageOptions,
    WebAppOptions,
    GoogleOAuthOptions,
    RazorpayOptions,
    ...Seeds,
    ...CronServices,
  ],
})
export class InfrastructureModule { }
