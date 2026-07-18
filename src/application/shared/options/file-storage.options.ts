import { IS3StorageOptions } from '@shared-libs';

export class FileStorageOptions implements IS3StorageOptions {
  public accessKeyId: string;
  public secretAccessKey: string;
  public bucket: string;
  public region: string;
  public endpoint?: string;

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    bucket: string,
    region: string,
    endpoint?: string,
  ) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.bucket = bucket;
    this.region = region;
    this.endpoint = endpoint;
  }
}
