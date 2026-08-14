import { InternalServerErrorException } from '@nestjs/common';
import * as FileType from 'file-type';
import * as Papa from 'papaparse';
import { extname, basename, dirname, join } from 'path';

import { IComparePathOptions, IFileName, IFileType } from './types';

export class FileHelper {
  private readonly allowedMimeTypes?: string[];
  protected delimiter: string;

  constructor(allowedMimeType?: string[], delimiter?: string) {
    this.allowedMimeTypes = allowedMimeType?.map((x) => x.toLowerCase()) ?? null;
    this.delimiter = delimiter ?? '/';
  }

  public arePathesEqual(x: string, y: string, opts: IComparePathOptions = {}): boolean {
    if (!x) throw new InternalServerErrorException("'x' is nil");
    if (!y) throw new InternalServerErrorException("'y' is nil");

    if (opts.ignoreCase) {
      x = x.toLowerCase();
      y = y.toLowerCase();
    }
    const xFile = this.getFileName(x);
    const yFile = this.getFileName(y);
    const extEq = opts.skipExt || xFile.ext === yFile.ext;
    const fileNameEq = xFile.fileName === yFile.fileName;
    const locationEq = opts.skipLocation || xFile.location === yFile.location;
    return extEq && fileNameEq && locationEq;
  }

  public joinPath(name: IFileName): string {
    // S3 bucket not working with path delimiter "\"(creating like one fileName paired\6400eb8012afb93dc4580f42\6400eb8e12afb93dc4580f45.jpg),
    // so need replace to "/" for correct folder structure
    return join(name.location, `${name.fileName}.${name.ext}`).replace(/\\/g, this.delimiter);
  }

  public getFileName(path: string): IFileName {
    const ext = extname(path) ?? '';
    const fileName = basename(path, ext) ?? '';
    const location = dirname(path) ?? '';
    return { fileName, ext: ext.substring(1), location };
  }

  public async getExtFromBufferAsync(data: Buffer): Promise<IFileType> {
    const type = await FileType.fromBuffer(data);
    if (type) {
      return type;
    }

    const text = data.toString('utf8').trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        JSON.parse(text);
        return { ext: 'json', mime: 'application/json' };
      } catch {
        // not valid JSON
      }
    }

    // Check for CSV by trying to parse it
    const parseResult = Papa.parse(data.toString('utf8'));
    if (parseResult.errors.length === 0) {
      return { ext: 'csv', mime: 'text/csv' };
    }
    return null;
  }

  public async isAllowedMimeAsync(buffer: Buffer): Promise<boolean> {
    const type = await this.getExtFromBufferAsync(buffer);
    if (!type) {
      return false;
    }
    return this.isAllowedMime(type.mime);
  }

  public isAllowedMime(mime: string): boolean {
    if (!mime) return false;

    // If no whitelist defined → allow all
    if (this.allowedMimeTypes?.length === 0) return true;

    return this.allowedMimeTypes.includes(mime.toLowerCase());
  }
}
