import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { AESEncryptOptions } from '../options';
import { IAESEncryptService } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class AESEncrypt implements IAESEncryptService {
  constructor(
    private readonly options: AESEncryptOptions,
    @InjectPinoLogger() private readonly logger: PinoLogger,
  ) {}

  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.options.algorithm, Buffer.from(this.options.key, 'base64'), iv);
      let encrypted = cipher.update(text, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const payload = {
        iv: iv.toString('base64'),
        data: encrypted,
      };
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    } catch (e) {
      // this.logger.error(e);
      return text;
    }
  }

  decrypt(encryptedBase64: string): string {
    try {
      const payload = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));
      const iv = Buffer.from(payload.iv, 'base64');
      const encryptedData = payload.data;

      const decipher = crypto.createDecipheriv(this.options.algorithm, Buffer.from(this.options.key, 'base64'), iv);

      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (e) {
      // this.logger.error(e);
      return encryptedBase64;
    }
  }
}
