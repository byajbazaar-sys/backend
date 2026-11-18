/** Encrypts secrets the marketing module stores (Kaggle API keys, Instagram tokens). */
export const MARKETING_SECRET_CIPHER = 'MARKETING_SECRET_CIPHER';

export interface IMarketingSecretCipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}
