export const BARCODE_SERVICE = 'BARCODE_SERVICE';

export interface InventoryQrPayload {
  inventoryId: string;
  sku: string;
}

export interface IBarcodeService {
  buildInventoryQrPayload(inventoryId: string, sku: string): string;
  parseInventoryQrPayload(raw: string): InventoryQrPayload | null;
  resolveQrPayload(stored: string | null | undefined, inventoryId: string, sku: string): string;
  generateBarcodePng(sku: string): Promise<Buffer>;
  generateBarcodeDataUrl(sku: string): Promise<string>;
  generateQrPng(payload: string): Promise<Buffer>;
  generateQrDataUrl(payload: string): Promise<string>;
}
