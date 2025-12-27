import { Injectable } from '@nestjs/common';
import { IFileStorage, IFileUrlResolver } from '@shared-libs';

@Injectable()
export class FileStorageMock implements IFileStorage, IFileUrlResolver {
  public existsAsync(_path: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  public readAsync(path: string): Promise<Buffer> {
    return Promise.resolve(Buffer.from(path, 'utf8'));
  }

  public writeAsync(path: string, _data: Buffer): Promise<string> {
    return Promise.resolve(`mock-${path}`);
  }

  public replaceAsync(path: string, _data: Buffer): Promise<string> {
    return Promise.resolve(`mock-${path}`);
  }

  public copyAsync(srcPath: string, destPath: string): Promise<string> {
    return Promise.resolve(`mock-${destPath}`);
  }

  public removeAsync(_path: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  public getUrlAsync(path: string): Promise<string> {
    return Promise.resolve(`http://${path}`);
  }

  public generateUploadUrlAsync(path: string): Promise<string> {
    return Promise.resolve(`http://${path}`);
  }
}
