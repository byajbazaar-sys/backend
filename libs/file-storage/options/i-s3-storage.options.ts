export interface IS3StorageOptions {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  /** S3-compatible endpoint (e.g. Backblaze B2). Omit for AWS S3. */
  endpoint?: string;
  /** Public CDN base URL, e.g. https://images.byajbazaar.com */
  imageCdnUrl?: string;
  /**
   * Object-key prefixes served through `imageCdnUrl` (must match the Worker's ALLOWED_PREFIXES).
   * Defaults to IMAGE_CDN_ALLOWED_PREFIXES (inventory, shop logos, orders).
   */
  cdnPrefixes?: readonly string[];
}
