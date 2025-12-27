import { Injectable } from '@nestjs/common';

@Injectable()
export class AESEncryptOptions {
  public key: string;
  public algorithm: string;
  constructor(key: string, algorithm: string) {
    this.key = key;
    this.algorithm = algorithm;
  }
}
