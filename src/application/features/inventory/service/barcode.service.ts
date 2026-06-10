import { Injectable } from '@nestjs/common';
import bwipjs from 'bwip-js';
import * as QRCode from 'qrcode';
import { BarcodeFormatType, BarcodeSizeType, IBarcodeService, InventoryQrPayload } from './i-barcode.service';

const BCID_MAP: Record<BarcodeFormatType, string> = {
  CODE128: 'code128',
  CODE39: 'code39',
  EAN13: 'ean13',
  UPC: 'upca',
};

const BARCODE_DIMS: Record<BarcodeSizeType, { scale: number; height: number; textsize: number }> = {
  small: { scale: 2, height: 8, textsize: 9 },
  medium: { scale: 4, height: 14, textsize: 11 },
  large: { scale: 5, height: 18, textsize: 13 },
};

const QR_WIDTH: Record<BarcodeSizeType, number> = {
  small: 120,
  medium: 200,
  large: 280,
};

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

  private resolveBcid(format: BarcodeFormatType): string {
    return BCID_MAP[format] ?? BCID_MAP.CODE128;
  }

  async generateBarcodePng(
    sku: string,
    format: BarcodeFormatType = 'CODE128',
    size: BarcodeSizeType = 'medium',
  ): Promise<Buffer> {
    const dims = BARCODE_DIMS[size] ?? BARCODE_DIMS.medium;
    const formatsToTry: BarcodeFormatType[] =
      format === 'CODE128' ? ['CODE128'] : [format, 'CODE128'];

    let lastError: unknown;
    for (const fmt of formatsToTry) {
      try {
        const png = await bwipjs.toBuffer({
          bcid: this.resolveBcid(fmt),
          text: sku,
          scale: dims.scale,
          height: dims.height,
          paddingwidth: 10,
          paddingheight: 8,
          includetext: true,
          textxalign: 'center',
          textsize: dims.textsize,
        });
        return png;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async generateBarcodeDataUrl(
    sku: string,
    format: BarcodeFormatType = 'CODE128',
    size: BarcodeSizeType = 'medium',
  ): Promise<string> {
    const buffer = await this.generateBarcodePng(sku, format, size);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  async generateQrPng(payload: string, size: BarcodeSizeType = 'medium'): Promise<Buffer> {
    const width = QR_WIDTH[size] ?? QR_WIDTH.medium;
    const dataUrl = await QRCode.toDataURL(payload, {
      width,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return Buffer.from(base64, 'base64');
  }

  async generateQrDataUrl(payload: string, size: BarcodeSizeType = 'medium'): Promise<string> {
    const width = QR_WIDTH[size] ?? QR_WIDTH.medium;
    return QRCode.toDataURL(payload, {
      width,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }
}
