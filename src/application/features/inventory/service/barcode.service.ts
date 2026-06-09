import { Injectable } from '@nestjs/common';
import bwipjs from 'bwip-js';
import * as QRCode from 'qrcode';
import { IBarcodeService, InventoryQrPayload } from './i-barcode.service';

@Injectable()
export class BarcodeService implements IBarcodeService {
  buildInventoryQrPayload(inventoryId: string, sku: string): string {
    return JSON.stringify({ inventoryId, sku });
  }

  parseInventoryQrPayload(raw: string): InventoryQrPayload | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const sku = typeof parsed.sku === 'string' ? parsed.sku.trim() : '';
      const inventoryId =
        typeof parsed.inventoryId === 'string'
          ? parsed.inventoryId.trim()
          : typeof parsed.id === 'string'
            ? parsed.id.trim()
            : '';
      if (!sku) return null;
      return { inventoryId, sku };
    } catch {
      return null;
    }
  }

  resolveQrPayload(stored: string | null | undefined, inventoryId: string, sku: string): string {
    if (stored?.trim()) return stored.trim();
    return this.buildInventoryQrPayload(inventoryId, sku);
  }

  async generateBarcodePng(sku: string): Promise<Buffer> {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: sku,
      scale: 4,
      height: 14,
      paddingwidth: 14,
      paddingheight: 10,
      includetext: true,
      textxalign: 'center',
      textsize: 11,
    });
    return png;
  }

  async generateBarcodeDataUrl(sku: string): Promise<string> {
    const buffer = await this.generateBarcodePng(sku);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  async generateQrPng(payload: string): Promise<Buffer> {
    const dataUrl = await QRCode.toDataURL(payload, {
      width: 200,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return Buffer.from(base64, 'base64');
  }

  async generateQrDataUrl(payload: string): Promise<string> {
    return QRCode.toDataURL(payload, {
      width: 200,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }
}
