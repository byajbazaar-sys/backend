import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import { MarketingConfig } from '../../marketing.config';

const VERSION = 'v1';

/**
 * AES-256-GCM for secrets the marketing module stores in its database (Kaggle API keys).
 * Ciphertext format: `v1.<iv>.<authTag>.<data>` (base64url parts). The key is SHA-256 of
 * MARKETING_CREDENTIALS_SECRET (falls back to TOKEN_SECRET) — changing it makes stored keys unreadable.
 */
@Injectable()
export class MarketingSecretCipher {
  constructor(private readonly config: MarketingConfig) {}

  private key(): Buffer {
    const secret = this.config.credentialsSecret;
    if (!secret) throw new Error('MARKETING_CREDENTIALS_SECRET (or TOKEN_SECRET) is not configured');
    return createHash('sha256').update(`marketing-credentials:${secret}`).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== VERSION || !iv || !tag || data === undefined) throw new Error('Unrecognised ciphertext format');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}
