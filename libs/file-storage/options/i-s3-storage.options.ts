export interface IS3StorageOptions {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  /** S3-compatible endpoint (e.g. Cloudflare R2). */
  endpoint?: string;
}
