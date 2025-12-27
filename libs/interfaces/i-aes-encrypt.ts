export const AES_ENCRYPT_SERVICE = 'IAESEncryptService';
export interface IAESEncryptService {
  encrypt(text: string): string;
  decrypt(encryptedData: string): string;
}
