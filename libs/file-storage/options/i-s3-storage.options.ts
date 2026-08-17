export interface IS3StorageOptions {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  /** S3-compatible endpoint (e.g. Backblaze B2). Omit for AWS S3. */
  endpoint?: string;
}
