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
  FileStorageOptions,
  LAMBDA_SERVICE,
  LOAN_ITEMS_REPOSITORY,
  LOANS_REPOSITORY,
  TRANSACTIONS_REPOSITORY,
  TWILIO_SERVICE,
  USERS_FILE_STORAGE,
  USERS_REPOSITORY,
} from '../application';
import {
  CustomersRepository,
  LoanItemsRepository,
  LoansRepository,
  TransactionsRepository,
  UsersRepository,
} from './persistence';
import { AESEncrypt, AESEncryptOptions } from './crypto';
import { FileStorageMock, UsersFileStorage } from './s3';
import { LambdaOptions, LambdaService } from './lambda';
import { AIOptions, AIResumeService } from './ai';
import { TwilioOptions, TwilioService } from './sms';

@Global()
@Module({
  imports: [
    HttpModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const opts = configService.get<IDbOptions>('database');
        if (!opts) {
          throw new Error('Database configuration is missing');
        }

        const { host, port, database, username, password } = opts;

        if (!host || !port || !database) {
          throw new Error('Missing required database configuration (host, port, or database name)');
        }

        return {
          uri:
            username && password
              ? `mongodb://${username}:${password}@${host}:${port}/${database}`
              : `mongodb://${host}:${port}/${database}`,
        };
      },
    }),
    MongooseModule.forFeature([...Schemas]),
  ],
  providers: [
    ...Seeds,
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
      provide: TRANSACTIONS_REPOSITORY,
      useClass: TransactionsRepository,
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
  ],
  exports: [
    HttpModule,
    USERS_REPOSITORY,
    CUSTOMERS_REPOSITORY,
    LOANS_REPOSITORY,
    LOAN_ITEMS_REPOSITORY,
    AES_ENCRYPT_SERVICE,
    USERS_FILE_STORAGE,
    LAMBDA_SERVICE,
    AI_RESUME_SERVICE,
    TWILIO_SERVICE,
    TRANSACTIONS_REPOSITORY,
    FileStorageOptions,
    ...Seeds,
  ],
})
export class InfrastructureModule {}
