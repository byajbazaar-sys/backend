import { BadRequestException, Injectable } from '@nestjs/common';
import bwipjs from 'bwip-js';
import * as QRCode from 'qrcode';

import { InventoryQrPayload } from '../domain';
import { EBarcodeFormat, EBarcodeSize } from '../enums';
import { IBarcodeService } from './i-barcode.service';

const BCID_MAP: Record<EBarcodeFormat, string> = {
  [EBarcodeFormat.CODE128]: 'code128',
  [EBarcodeFormat.CODE39]: 'code39',
  [EBarcodeFormat.EAN13]: 'ean13',
  [EBarcodeFormat.UPC]: 'upca',
};

/** Module scale and bar height (mm). Text is omitted — labels print the code separately. */
const BARCODE_DIMS: Record<EBarcodeSize, { scale: number; height: number }> = {
  [EBarcodeSize.Small]: { scale: 3, height: 12 },
  [EBarcodeSize.Medium]: { scale: 4, height: 16 },
  [EBarcodeSize.Large]: { scale: 5, height: 20 },
};

const QR_WIDTH: Record<EBarcodeSize, number> = {
  [EBarcodeSize.Small]: 120,
  [EBarcodeSize.Medium]: 200,
  [EBarcodeSize.Large]: 280,
};

@Injectable()
export class BarcodeService implements IBarcodeService {
  buildInventoryQrPayload(inventoryId: string, sku: string): string {
    return JSON.stringify({ inventoryId, sku });
  }

  parseInventoryQrPayload(raw: string): InventoryQrPayload {
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

  resolveQrPayload(stored: string, inventoryId: string, sku: string): string {
    if (stored?.trim()) return stored.trim();
    return this.buildInventoryQrPayload(inventoryId, sku);
  }

  resolveBarcodeText(barcode?: string, sku?: string): string {
    const value = (barcode ?? sku ?? '').trim();
    if (!value) throw new BadRequestException('Barcode value is required');
    return value;
  }

  private resolveBcid(format: EBarcodeFormat): string {
    return BCID_MAP[format] ?? BCID_MAP[EBarcodeFormat.CODE128];
  }

  async generateBarcodePng(
    text: string,
    format: EBarcodeFormat = EBarcodeFormat.CODE128,
    size: EBarcodeSize = EBarcodeSize.Medium,
  ): Promise<Buffer> {
    const encoded = text.trim();
    if (!encoded) throw new BadRequestException('Barcode value is required');

    const dims = BARCODE_DIMS[size] ?? BARCODE_DIMS[EBarcodeSize.Medium];
    const formatsToTry: EBarcodeFormat[] =
      format === EBarcodeFormat.CODE128 ? [EBarcodeFormat.CODE128] : [format, EBarcodeFormat.CODE128];

    let lastError: unknown;
    for (const fmt of formatsToTry) {
      try {
        const png = await bwipjs.toBuffer({
          bcid: this.resolveBcid(fmt),
          text: encoded,
          scale: dims.scale,
          height: dims.height,
          paddingwidth: 12,
          paddingheight: 6,
          includetext: false,
        });
        return png;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async generateBarcodeDataUrl(
    text: string,
    format: EBarcodeFormat = EBarcodeFormat.CODE128,
    size: EBarcodeSize = EBarcodeSize.Medium,
  ): Promise<string> {
    const buffer = await this.generateBarcodePng(text, format, size);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  async generateQrPng(payload: string, size: EBarcodeSize = EBarcodeSize.Medium): Promise<Buffer> {
    const width = QR_WIDTH[size] ?? QR_WIDTH[EBarcodeSize.Medium];
    const dataUrl = await QRCode.toDataURL(payload, {
      width,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return Buffer.from(base64, 'base64');
  }

  async generateQrDataUrl(payload: string, size: EBarcodeSize = EBarcodeSize.Medium): Promise<string> {
    const width = QR_WIDTH[size] ?? QR_WIDTH[EBarcodeSize.Medium];
    return QRCode.toDataURL(payload, {
      width,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }
}
