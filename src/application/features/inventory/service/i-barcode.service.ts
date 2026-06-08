export const BARCODE_SERVICE = 'BARCODE_SERVICE';

export interface IBarcodeService {
  generateBarcodePng(sku: string): Promise<Buffer>;
  generateBarcodeDataUrl(sku: string): Promise<string>;
}
