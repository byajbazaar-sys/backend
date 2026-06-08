import { Injectable } from '@nestjs/common';
import bwipjs from 'bwip-js';
import { IBarcodeService } from './i-barcode.service';

@Injectable()
export class BarcodeService implements IBarcodeService {
  async generateBarcodePng(sku: string): Promise<Buffer> {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: sku,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });
    return png;
  }

  async generateBarcodeDataUrl(sku: string): Promise<string> {
    const buffer = await this.generateBarcodePng(sku);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
}
