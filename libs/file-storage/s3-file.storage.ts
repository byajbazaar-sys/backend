import {
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PinoLogger } from 'nestjs-pino';
import { Readable } from 'stream';

import { FileHelper } from './file-helper';
import { IFileStorage } from './i-file-storage';
import { IFileUrlResolver } from './i-file-url.resolver';
import { IS3StorageOptions } from './options';
import { EAttachmentMimeType } from '../enums';
import { compressImage } from './image-compressor';

const EXPIRATION_MS = 604800;

export abstract class S3FileStorage implements IFileStorage, IFileUrlResolver {
  protected readonly client: S3Client;
  protected readonly helper: FileHelper;

  constructor(
    protected readonly storageOptions: IS3StorageOptions,
    protected readonly logger: PinoLogger,
    allowedMimeTypes?: string[],
  ) {
    this.client = new S3Client({
      credentials: {
        accessKeyId: storageOptions.accessKeyId,
        secretAccessKey: storageOptions.secretAccessKey,
      },
      region: storageOptions.region,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      ...(storageOptions.endpoint ? { endpoint: storageOptions.endpoint, forcePathStyle: true } : {}),
    });
    this.helper = new FileHelper(allowedMimeTypes);
  }

  public abstract get isPublic(): boolean;

  /**
   * Normalizes object keys (strips leading slashes).
   */
  protected resolveKey(path: string): string {
    return (path || '').replace(/^\/+/, '');
  }

  public async existsAsync(path: string): Promise<boolean> {
    const key = this.resolveKey(path);
    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.storageOptions.bucket,
          Key: key,
        }),
      );
      return !!res;
    } catch (ex) {
      if (ex.code === 'NotFound' || ex.name === 'NotFound') {
        return false;
      }
      this.logger.error(ex);
      throw new Error(ex);
    }
  }

  public async readAsync(path: string): Promise<Buffer> {
    const key = this.resolveKey(path);
    if (!(await this.existsAsync(key))) {
      return null;
    }
    try {
      const getCmd = new GetObjectCommand({
        Bucket: this.storageOptions.bucket,
        Key: key,
      });
      const res = await this.client.send(getCmd);
      const stream = res.Body as Readable;
      return await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.once('end', () => {
          resolve(Buffer.concat(chunks));
        });
        stream.once('error', reject);
      });
    } catch (ex) {
      this.logger.error(ex);
      throw new Error(ex);
    }
  }

  public async writeAsync(path: string, data: Buffer, contentType: string = null): Promise<string> {
    try {
      data = await compressImage(data, contentType);
    } catch (err) {
      this.logger.warn({ err }, 'Image compression failed; uploading original buffer');
    }
    const type = await this.helper.getExtFromBufferAsync(data);
    if (!this.validateType(type?.mime)) {
      throw new Error('This file type is invalid');
    }
    try {
      const fileName = this.helper.getFileName(this.resolveKey(path));
      fileName.ext = type.ext;
      const key = this.helper.joinPath(fileName);
      const startCmd = new CreateMultipartUploadCommand({
        Bucket: this.storageOptions.bucket,
        Key: key,
        ...(contentType ? { ContentType: contentType } : {}),
      });
      const { UploadId: uploadId } = await this.client.send(startCmd);

      const uploadCmd = new UploadPartCommand({
        Bucket: this.storageOptions.bucket,
        Key: key,
        Body: data,
        PartNumber: 1,
        UploadId: uploadId,
      });
      const partRes = await this.client.send(uploadCmd);

      const finishCmd = new CompleteMultipartUploadCommand({
        Bucket: this.storageOptions.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: [{ PartNumber: 1, ETag: partRes.ETag }] },
      });
      const fRes = await this.client.send(finishCmd);
      return fRes.Key;
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
    const resolvedPath = this.resolveKey(path);
    const fileName = this.helper.getFileName(resolvedPath);
    fileName.ext = type.ext;
    const substitutedPath = this.helper.joinPath(fileName);
    const result = await this.writeAsync(substitutedPath, data);
    if (type.ext.toLowerCase() !== fileName.ext.toLowerCase()) {
      await this.removeAsync(resolvedPath);
    }
    return result;
  }

  public async copyAsync(srcPath: string, destPath: string): Promise<string> {
    const resolvedSrc = this.resolveKey(srcPath);
    const resolvedDest = this.resolveKey(destPath);
    if (this.helper.arePathesEqual(resolvedSrc, resolvedDest, { skipExt: true })) {
      throw new Error(`You cant copy file to the same place`);
    }
    if (!(await this.existsAsync(resolvedSrc))) {
      throw new Error(`Source File "${srcPath}" not found`);
    }
    try {
      const src = this.helper.getFileName(resolvedSrc);
      const dest = this.helper.getFileName(resolvedDest);
      const key = this.helper.joinPath({
        location: dest.location,
        ext: src.ext,
        fileName: dest.fileName,
      });

      const copyCmd = new CopyObjectCommand({
        Bucket: this.storageOptions.bucket,
        CopySource: resolvedSrc,
        Key: key,
      });
      await this.client.send(copyCmd);
      return key;
    } catch (ex) {
      this.logger.error(ex);
      throw new Error(ex);
    }
  }

  public async removeAsync(path: string): Promise<boolean> {
    const key = this.resolveKey(path);
    if (!(await this.existsAsync(key))) {
      return false;
    }
    try {
      const removeCmd = new DeleteObjectCommand({
        Bucket: this.storageOptions.bucket,
        Key: key,
      });
      await this.client.send(removeCmd);
      return true;
    } catch (ex) {
      this.logger.error(ex);
      throw new Error(ex);
    }
  }

  public async getUrlAsync(path: string): Promise<string> {
    try {
      const key = this.resolveKey(path);
      return this.isPublic ? await this.getSimpleUrlAsync(key) : await this.getSignedUrlAsync(key);
    } catch (ex) {
      this.logger.error(ex);
      return null;
    }
  }

  public async getSignedUrlAsync(path: string): Promise<string> {
    const key = this.resolveKey(path);
    if (!(await this.existsAsync(key))) {
      return null;
    }
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.storageOptions.bucket,
          Key: key,
        }),
        { expiresIn: EXPIRATION_MS },
      );
    } catch (ex) {
      this.logger.error(ex);
      throw new Error(ex);
    }
  }

  public async getSimpleUrlAsync(path: string): Promise<string> {
    const key = this.resolveKey(path);
    if (!(await this.existsAsync(key))) {
      return null;
    }
    const url = new URL(`https://${this.storageOptions.bucket}.s3.${this.storageOptions.region}.amazonaws.com/${key}`);
    url.searchParams.append('x-id', 'GetObject');
    return url.toString();
  }

  public async generateUploadUrlAsync(path: string, mimeType: EAttachmentMimeType): Promise<string> {
    const key = this.resolveKey(path);
    const command = new PutObjectCommand({ Bucket: this.storageOptions.bucket, Key: key, ContentType: mimeType });
    return getSignedUrl(this.client, command, { expiresIn: EXPIRATION_MS });
  }

  protected validateType(mime: string): boolean {
    return this.helper.isAllowedMime(mime);
  }
}
