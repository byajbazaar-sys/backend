import { Injectable } from '@nestjs/common';
import { S3FileStorage } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IUsersFileStorage, FileStorageOptions } from '../../application';

@Injectable()
export class UsersFileStorage extends S3FileStorage implements IUsersFileStorage {
  constructor(options: FileStorageOptions, @InjectPinoLogger(UsersFileStorage.name) logger: PinoLogger) {
    super(options, logger);
  }

  public get isPublic(): boolean {
    return false;
  }
}
