import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IUsersFileStorage ,FileStorageOptions} from '../../application';
import { S3FileStorage } from '@shared-libs';

@Injectable()
export class UsersFileStorage extends S3FileStorage implements IUsersFileStorage {
  constructor(options: FileStorageOptions, @InjectPinoLogger(UsersFileStorage.name) logger: PinoLogger) {
    super(options, logger);
  }

  public get isPublic(): boolean {
    return false;
  }
}
