import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AES_ENCRYPT_SERVICE, IDbOptions } from '@shared-libs';
import {
  AI_RESUME_SERVICE,
  CUSTOMERS_REPOSITORY,
  DUES_REPOSITORY,
  EMAIL_SERVICE,
  FileStorageOptions,
  GOOGLE_OAUTH_SERVICE,
  GoogleOAuthOptions,
  ITEMS_REPOSITORY,
  LAMBDA_SERVICE,
  LOAN_ITEMS_REPOSITORY,
  LOANS_REPOSITORY,
  NOTIFICATIONS_REPOSITORY,
  SUPPORT_REQUESTS_REPOSITORY,
  TRANSACTIONS_REPOSITORY,
  TWILIO_SERVICE,
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
  RazorpayOptions,
  EVENTS_DISCOVERY_SERVICE,
  TRY_ON_AI_SERVICE,
  TRY_ON_ORCHESTRATOR,
  PRODUCT_IMAGE_AI_SERVICE,
} from '../application';
import {
  CustomersRepository,
  DuesRepository,
  ItemsRepository,
  LoanItemsRepository,
  LoansRepository,
  NotificationsRepository,
  SupportRequestsRepository,
  TransactionsRepository,
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
} from './persistence';
import { WEBSOCKET_MESSAGE_SERVICE } from '../application';
import { WebSocketMessageService } from './websocket/websocket-message.service';
import { AESEncrypt, AESEncryptOptions } from './crypto';
import { FileStorageMock, UsersFileStorage } from './s3';
import { LambdaOptions, LambdaService } from './lambda';
import {
  AIOptions,
  AIResumeService,
  AivotTryOnOptions,
  ReplicateTryOnOptions,
  CloudflareTryOnOptions,
} from './ai';
import { AivotService } from './ai/services/aivot.service';
import { BedrockService } from './ai/services/bedrock.service';
import { GeminiService } from './ai/services/gemini.service';
import { ReplicateTryOnService } from './ai/services/replicate.service';
import { CloudflareTryOnService } from './ai/services/cloudflare-try-on.service';
import { TryOnOrchestratorService } from './ai/services/try-on-orchestrator.service';
import { TwilioOptions, TwilioService } from './sms';
import { SendGridOptions, SendGridService } from './send-grid';
import { SesOptions, SesService } from './ses';
import { ResendOptions, ResendService } from './resend';
import { resolveEmailServiceProvider } from './email/resolve-email-service';
import { WebAppOptions } from '../application';
import CronServices from './cron';
import { generateDataSourceOptions } from './persistence/type-orm.config';
import Entities from './persistence/entities';
import Seeds from './persistence/seeds';
import { GoogleOAuthService } from './google-oauth';

@Global()
@Module({
  imports: [
    HttpModule,
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
      provide: LambdaOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new LambdaOptions(
          configService.get('lambda').region,
          configService.get('lambda').accessKeyId,
          configService.get('lambda').secretAccessKey,
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
      provide: ReplicateTryOnOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('replicateTryOn'),
    },
    {
      provide: CloudflareTryOnOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('cloudflareTryOn'),
    },
    {
      provide: TwilioOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new TwilioOptions(
          configService.get('twilio').accountSid,
          configService.get('twilio').authToken,
          configService.get('twilio').phoneNumber,
        ),
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
    {
      provide: LAMBDA_SERVICE,
      useClass: LambdaService,
    },
    {
      provide: AI_RESUME_SERVICE,
      useClass: AIResumeService,
    },
    GeminiService,
    BedrockService,
    AivotService,
    ReplicateTryOnService,
    CloudflareTryOnService,
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
      inject: [
        AIOptions,
        GeminiService,
        BedrockService,
        AivotService,
        ReplicateTryOnService,
        CloudflareTryOnService,
      ],
      useFactory: (
        options: AIOptions,
        gemini: GeminiService,
        bedrock: BedrockService,
        aivot: AivotService,
        replicate: ReplicateTryOnService,
        cloudflare: CloudflareTryOnService,
      ) => {
        if (options.tryOnProvider === 'aivot') return aivot;
        if (options.tryOnProvider === 'replicate') return replicate;
        if (options.tryOnProvider === 'cloudflare') return cloudflare;
        if (options.tryOnProvider === 'gemini' || options.provider === 'gemini') return gemini;
        return bedrock;
      },
    },
    {
      provide: EVENTS_DISCOVERY_SERVICE,
      inject: [AIOptions, GeminiService, BedrockService],
      useFactory: (options: AIOptions, gemini: GeminiService, bedrock: BedrockService) =>
        options.provider === 'gemini' ? gemini : bedrock,
    },
    {
      provide: TWILIO_SERVICE,
      useClass: TwilioService,
    },
    {
      provide: SendGridOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('sendGrid'),
    },
    {
      provide: SesOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('ses'),
    },
    {
      provide: ResendOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('resend'),
    },
    SesService,
    ResendService,
    {
      provide: WebAppOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('webApp'),
    },
    {
      provide: EMAIL_SERVICE,
      useClass: resolveEmailServiceProvider(),
    },
    {
      provide: GOOGLE_OAUTH_SERVICE,
      useClass: GoogleOAuthService,
    }
  ],
  exports: [
    HttpModule,
    USERS_REPOSITORY,
    CUSTOMERS_REPOSITORY,
    LOANS_REPOSITORY,
    LOAN_ITEMS_REPOSITORY,
    ITEMS_REPOSITORY,
    AES_ENCRYPT_SERVICE,
    USERS_FILE_STORAGE,
    LAMBDA_SERVICE,
    AI_RESUME_SERVICE,
    TRY_ON_AI_SERVICE,
    TRY_ON_ORCHESTRATOR,
    PRODUCT_IMAGE_AI_SERVICE,
    EVENTS_DISCOVERY_SERVICE,
    TWILIO_SERVICE,
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
    COUPON_REDEMPTIONS_REPOSITORY,
    REFUNDS_REPOSITORY,
    WEBSOCKET_MESSAGE_SERVICE,
    EMAIL_SERVICE,
    GOOGLE_OAUTH_SERVICE,
    FileStorageOptions,
    WebAppOptions,
    GoogleOAuthOptions,
    RazorpayOptions,
    ...Seeds,
    ...CronServices,
  ],
})
export class InfrastructureModule { }
