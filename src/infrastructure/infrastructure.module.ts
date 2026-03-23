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
} from './persistence';
import { AESEncrypt, AESEncryptOptions } from './crypto';
import { FileStorageMock, UsersFileStorage } from './s3';
import { LambdaOptions, LambdaService } from './lambda';
import { AIOptions, AIResumeService } from './ai';
import { TwilioOptions, TwilioService } from './sms';
import { SendGridOptions, SendGridService } from './send-grid';
import { SesOptions, SesService } from './ses';
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
      useFactory: (configService: ConfigService) =>
        new AIOptions(
          configService.get('ai').openaiApiKey,
          configService.get('ai').geminiApiKey,
          configService.get('ai').claudeApiKey,
        ),
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
    SesService,
    {
      provide: WebAppOptions,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('webApp'),
    },
    {
      provide: EMAIL_SERVICE,
      useClass: process.env.EMAIL_SERVICE_PROVIDER === 'ses' ? SesService : SendGridService,
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
    TWILIO_SERVICE,
    TRANSACTIONS_REPOSITORY,
    DUES_REPOSITORY,
    NOTIFICATIONS_REPOSITORY,
    SUPPORT_REQUESTS_REPOSITORY,
    EMAIL_SERVICE,
    GOOGLE_OAUTH_SERVICE,
    FileStorageOptions,
    WebAppOptions,
    GoogleOAuthOptions,
    ...Seeds,
    ...CronServices,
  ],
})
export class InfrastructureModule { }
