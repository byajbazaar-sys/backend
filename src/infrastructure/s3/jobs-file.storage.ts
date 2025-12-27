import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IJobsFileStorage } from '../../application';
import { S3FileStorage } from '@shared-libs';
import { FileStorageOptions } from './options';

@Injectable()
export class JobsFileStorage extends S3FileStorage implements IJobsFileStorage {
  constructor(options: FileStorageOptions, @InjectPinoLogger(JobsFileStorage.name) logger: PinoLogger) {
    super(options, logger);
  }

  public get isPublic(): boolean {
    return false;
  }
}
