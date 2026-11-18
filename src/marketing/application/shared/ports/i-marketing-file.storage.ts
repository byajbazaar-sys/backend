import { EAttachmentMimeType } from '@shared-libs';

/** Marketing's own S3 bucket. */
export const MARKETING_FILE_STORAGE = 'MARKETING_FILE_STORAGE';

export interface IMarketingFileStorage {
  existsAsync(path: string): Promise<boolean>;
  readAsync(path: string): Promise<Buffer>;
  writeAsync(path: string, data: Buffer, contentType?: string): Promise<string>;
  removeAsync(path: string): Promise<boolean>;
  getUrlAsync(path: string): Promise<string>;
  generateUploadUrlAsync(path: string, mimeType: EAttachmentMimeType): Promise<string>;
}
