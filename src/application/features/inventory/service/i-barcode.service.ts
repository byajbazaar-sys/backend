export const BARCODE_SERVICE = 'BARCODE_SERVICE';

export interface InventoryQrPayload {
  inventoryId: string;
  sku: string;
}

export type BarcodeFormatType = 'CODE128' | 'CODE39' | 'EAN13' | 'UPC';
export type BarcodeSizeType = 'small' | 'medium' | 'large';

export interface IBarcodeService {
  buildInventoryQrPayload(inventoryId: string, sku: string): string;
  parseInventoryQrPayload(raw: string): InventoryQrPayload | null;
  resolveQrPayload(stored: string | null | undefined, inventoryId: string, sku: string): string;
  generateBarcodePng(sku: string, format?: BarcodeFormatType, size?: BarcodeSizeType): Promise<Buffer>;
  generateBarcodeDataUrl(sku: string, format?: BarcodeFormatType, size?: BarcodeSizeType): Promise<string>;
  generateQrPng(payload: string, size?: BarcodeSizeType): Promise<Buffer>;
  generateQrDataUrl(payload: string, size?: BarcodeSizeType): Promise<string>;
}
