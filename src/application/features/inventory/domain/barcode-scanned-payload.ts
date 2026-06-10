import { InventoryItem } from './inventory-item';

export interface BarcodeScannedPayload {
  type: 'barcodeScanned';
  barcode: string;
  item?: InventoryItem;
  timestamp: string;
}
