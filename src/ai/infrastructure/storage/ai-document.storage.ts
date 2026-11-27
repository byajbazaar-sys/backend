import { Injectable } from '@nestjs/common';
import { S3FileStorage } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AiConfig } from '../../ai.config';
import { IAiDocumentStorage } from '../../application';

/**
 * The AI bucket (AI_S3_*, a private Backblaze B2 bucket; falls back to the main bucket under `ai/`): knowledge
 * documents admins upload. Private — nothing here is served to browsers.
 */
@Injectable()
export class AiDocumentStorage extends S3FileStorage implements IAiDocumentStorage {
  private readonly hasBucket: boolean;

  constructor(config: AiConfig, @InjectPinoLogger(AiDocumentStorage.name) logger: PinoLogger) {
    super(config.storage, logger);
    this.hasBucket = !!(config.storage.bucket && config.storage.accessKeyId && config.storage.secretAccessKey);
  }

  // Getter (not a field): implements the abstract accessor on S3FileStorage.
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  public get isPublic(): boolean {
    return false;
  }

  get configured(): boolean {
    return this.hasBucket;
  }

  async write(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.writeAsync(key, data, contentType);
  }

  read(key: string): Promise<Buffer> {
    return this.readAsync(key);
  }

  async remove(key: string): Promise<void> {
    await this.removeAsync(key);
  }
}
