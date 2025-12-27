export interface IFileStorage {
  /**
   * @param path Relative path to storage
   * @returns Status of file existance
   */
  existsAsync(path: string): Promise<boolean>;

  /**
   * @param path Relative path to storage
   * @returns File Buffer
   */
  readAsync(path: string): Promise<Buffer>;

  /**
   * @param path Relative path to storage, extension is not required <file_1.txt | file_1>
   * @param data File Buffer
   * @returns Relative path to storage with extension
   */
  writeAsync(path: string, data: Buffer, contentType?: string): Promise<string>;

  /**
   * @param path Relative path to storage
   * @param data File Buffer
   * @returns Relative path to storage with extension
   */
  replaceAsync(path: string, data: Buffer): Promise<string>;

  /**
   * @param srcPath Relative path to storage of source file
   * @param destPath Relative path to storage of destination file, extension is not required <file_1.txt | file_1>
   * @returns Relative path to storage with extension
   */
  copyAsync(srcPath: string, destPath: string): Promise<string>;

  /**
   * @param path Relative path to storage
   * @returns Operation status
   */
  removeAsync(path: string): Promise<boolean>;
}
