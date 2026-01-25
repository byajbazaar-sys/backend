import { HttpModule } from '@nestjs/axios';
import { Global, Module, Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import Schemas from './persistence/schemas';
import Seeds from './persistence/seeds';
import { ConfigService } from '@nestjs/config';
import { AES_ENCRYPT_SERVICE, IDbOptions } from '@shared-libs';
import {
  AI_RESUME_SERVICE,
  CUSTOMERS_REPOSITORY,
  DUES_REPOSITORY,
  FileStorageOptions,
  ITEMS_REPOSITORY,
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
  DuesRepository,
  ItemsRepository,
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
import CronServices from './cron';

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
        const logger = new Logger('MongooseModule');
        logger.log(`Database configuration: ${host}:${port || 27017}/${database}`);

        if (!host || !database) {
          throw new Error('Missing required database configuration (host or database name)');
        }

        // Detect MongoDB Atlas (hosts ending with .mongodb.net)
        const isAtlas = host.includes('.mongodb.net');

        let uri: string;
        if (isAtlas) {
          // MongoDB Atlas uses mongodb+srv:// protocol and doesn't require port
          // Check if username and password are provided and not empty
          if (!username || !password || username.trim() === '' || password.trim() === '') {
            throw new Error(
              'MongoDB Atlas requires username and password. ' +
                'Please set DB_USERNAME and DB_PASSWORD environment variables.',
            );
          }
          // URL encode username and password to handle special characters
          const encodedUsername = encodeURIComponent(username);
          const encodedPassword = encodeURIComponent(password);
          uri = `mongodb+srv://${encodedUsername}:${encodedPassword}@${host}/${database}?retryWrites=true&w=majority`;
          logger.log(`Connecting to MongoDB Atlas at ${host}/${database}...`);
        } else {
          // Standard MongoDB connection
          const dbPort = port || 27017;
          if (username && password) {
            const encodedUsername = encodeURIComponent(username);
            const encodedPassword = encodeURIComponent(password);
            uri = `mongodb://${encodedUsername}:${encodedPassword}@${host}:${dbPort}/${database}?retryWrites=true&w=majority`;
          } else {
            uri = `mongodb://${host}:${dbPort}/${database}`;
          }
          logger.log(`Connecting to MongoDB at ${host}:${dbPort}/${database}...`);
        }

        const connectionOptions: any = {
          uri,
          serverSelectionTimeoutMS: isAtlas ? 10000 : 5000, // Atlas may need more time
          socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
          connectTimeoutMS: isAtlas ? 30000 : 10000, // Atlas connections may take longer
          maxPoolSize: 10, // Maintain up to 10 socket connections
          minPoolSize: 1, // Maintain at least 1 socket connection
          retryWrites: true,
          w: 'majority',
        };

        // For Atlas, add additional options
        if (isAtlas) {
          connectionOptions.tls = true; // Atlas requires TLS
          connectionOptions.tlsAllowInvalidCertificates = false;
        }

        return connectionOptions;
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
    ITEMS_REPOSITORY,
    AES_ENCRYPT_SERVICE,
    USERS_FILE_STORAGE,
    LAMBDA_SERVICE,
    AI_RESUME_SERVICE,
    TWILIO_SERVICE,
    TRANSACTIONS_REPOSITORY,
    DUES_REPOSITORY,
    FileStorageOptions,
    ...Seeds,
    ...CronServices,
  ],
})
export class InfrastructureModule {}
