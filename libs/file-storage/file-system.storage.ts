import { PinoLogger } from 'nestjs-pino';
import { IFileStorage } from './i-file-storage';
import { IFileSystemStorageOptions } from './options';
import { existsSync } from 'fs';
import { writeFile, readFile, copyFile, unlink } from 'fs/promises';
import { join } from 'path';
import { platform } from 'os';
import { FileHelper } from './file-helper';

export abstract class FileSystemStorage implements IFileStorage {
  protected readonly helper: FileHelper;

  constructor(
    protected readonly options: IFileSystemStorageOptions,
    protected readonly logger: PinoLogger,
  ) {
    this.helper = new FileHelper(options.allowedMimeTypes);
  }

  public async existsAsync(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject): void => {
      try {
        const fullPath = this.getFullPath(path);
        resolve(existsSync(fullPath));
      } catch (ex) {
        this.logger.error(ex);

        reject(new Error(ex));
      }
    });
  }

  public async readAsync(path: string): Promise<Buffer> {
    const fullPath = this.getFullPath(path);
    if (!(await this.existsAsync(fullPath))) {
      throw new Error(`File "${fullPath}" not found`);
    }
    try {
      const buffer = await readFile(fullPath);
      return buffer;
    } catch (ex) {
      this.logger.error(ex);
      throw new Error(ex);
    }
  }

  public async writeAsync(path: string, data: Buffer): Promise<string> {
    const type = await this.helper.getExtFromBufferAsync(data);
    if (!this.validateType(type?.mime)) {
      throw new Error('This file type is invalid');
    }
    try {
      const f = this.helper.getFileName(path);
      f.location = this.options.folder;
      f.ext = type.ext;
      const fullPath = this.helper.joinPath(f);
      await writeFile(fullPath, data);
      return `${f.fileName}.${f.ext}`;
    } catch (ex) {
      this.logger.error(ex);
      throw new Error(ex);
    }
  }

  public async replaceAsync(path: string, data: Buffer): Promise<string> {
    const type = await this.helper.getExtFromBufferAsync(data);
    if (!this.validateType(type?.mime)) {
      throw new Error('This file type is invalid');
    }
    const { fileName, ext } = this.helper.getFileName(path);
    const result = await this.writeAsync(fileName, data);
    if (type.ext.toLowerCase() !== ext.toLowerCase()) {
      await this.removeAsync(path);
    }
    return result;
  }

  public async copyAsync(srcPath: string, destPath: string): Promise<string> {
    if (this.helper.arePathesEqual(srcPath, destPath, { skipExt: true, ignoreCase: this.isCaseInsensitive() })) {
      throw new Error(`You cant copy file to the same place`);
    }
    if (!(await this.existsAsync(srcPath))) {
      throw new Error(`Source File "${srcPath}" not found`);
    }
    try {
      const src = this.helper.getFileName(srcPath);
      const dest = this.helper.getFileName(destPath);
      srcPath = this.helper.joinPath({
        location: this.options.folder,
        ext: src.ext,
        fileName: src.fileName,
      });
      destPath = this.helper.joinPath({
        location: this.options.folder,
        ext: src.ext,
        fileName: dest.fileName,
      });

      await copyFile(srcPath, destPath);
      return `${dest.fileName}.${dest.ext}`;
    } catch (ex) {
      this.logger.error(ex);

      throw new Error(ex);
    }
  }

  public async removeAsync(path: string): Promise<boolean> {
    if (!(await this.existsAsync(path))) {
      return false;
    }
    try {
      const f = this.helper.getFileName(path);
      f.location = this.options.folder;
      path = this.helper.joinPath(f);
      await unlink(path);
      return true;
    } catch (ex) {
      this.logger.error(ex);

      throw new Error(ex);
    }
  }

  protected getFullPath(path: string): string {
    return join(this.options.folder, path);
  }

  protected validateType(mime: string): boolean {
    return this.helper.isAllowedMime(mime);
  }

  private isCaseInsensitive(): boolean {
    const os = platform();
    return os === 'darwin' || os === 'win32';
  }
}
