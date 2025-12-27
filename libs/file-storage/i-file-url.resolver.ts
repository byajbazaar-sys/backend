import { EAttachmentMimeType } from '../enums';

export interface IFileUrlResolver {
  /**
   * @param path Relative path to storage
   * @returns Url to file
   */
  getUrlAsync(path: string): Promise<string>;

  /**
   * @param path Relative path to storage
   * @param mimeType Mime type of file
   * @returns Signed url for upload file
   */
  generateUploadUrlAsync(path: string, mimeType: EAttachmentMimeType): Promise<string>;
}
