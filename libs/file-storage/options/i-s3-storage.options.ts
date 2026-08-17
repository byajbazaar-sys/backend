export interface IS3StorageOptions {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  /** S3-compatible endpoint (e.g. Backblaze B2). Omit for AWS S3. */
  endpoint?: string;
  /**
   * Optional key prefix (e.g. `dev`). Applied to all object keys.
   * Empty / undefined = no prefix (production).
   */
  keyPrefix?: string;
}
