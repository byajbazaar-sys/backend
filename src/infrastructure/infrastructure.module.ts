import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import Schemas from './persistence/schemas';
import Seeds from './persistence/seeds';
import { ConfigService } from '@nestjs/config';
import { AES_ENCRYPT_SERVICE, IDbOptions } from '@shared-libs';
import {
  AI_RESUME_SERVICE,
  CUSTOMERS_REPOSITORY,
  DUES_REPOSITORY,
  EMAIL_SERVICE,
  FileStorageOptions,
  ITEMS_REPOSITORY,
  LAMBDA_SERVICE,
  LOAN_ITEMS_REPOSITORY,
  LOANS_REPOSITORY,
  NOTIFICATIONS_REPOSITORY,
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

@Global()
@Module({
  imports: [
    HttpModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<IDbOptions>('database')?.uri?.trim();
        if (!uri) {
          throw new Error(
            'Database configuration is missing. Please set MONGO_URL, MONGODB_URI, or DATABASE_URL environment variable.',
          );
        }
        return {
          uri,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000,
          maxPoolSize: 10,
          minPoolSize: 1,
          retryWrites: true,
          w: 'majority',
        };
      },
    }),
    MongooseModule.forFeature([...Schemas]),
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
    EMAIL_SERVICE,
    FileStorageOptions,
    WebAppOptions,
    ...Seeds,
    ...CronServices,
  ],
})
export class InfrastructureModule { }
