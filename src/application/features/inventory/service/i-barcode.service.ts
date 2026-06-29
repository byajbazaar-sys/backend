import { EBarcodeFormat, EBarcodeSize } from '../enums';
import { InventoryQrPayload } from '../domain';

export const BARCODE_SERVICE = 'BARCODE_SERVICE';

export interface IBarcodeService {
  buildInventoryQrPayload(inventoryId: string, sku: string): string;
  parseInventoryQrPayload(raw: string): InventoryQrPayload | null;
  resolveQrPayload(stored: string | null | undefined, inventoryId: string, sku: string): string;
  /** Prefer stored barcode; fall back to SKU (both are scannable). */
  resolveBarcodeText(barcode?: string | null, sku?: string | null): string;
  /** `text` is the value encoded in the symbol (barcode or SKU). */
  generateBarcodePng(text: string, format?: EBarcodeFormat, size?: EBarcodeSize): Promise<Buffer>;
  generateBarcodeDataUrl(text: string, format?: EBarcodeFormat, size?: EBarcodeSize): Promise<string>;
  generateQrPng(payload: string, size?: EBarcodeSize): Promise<Buffer>;
  generateQrDataUrl(payload: string, size?: EBarcodeSize): Promise<string>;
}
