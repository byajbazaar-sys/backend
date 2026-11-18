import { InventoryItem } from '../../inventory';

export interface BarcodeScannedPayload {
  type: 'barcodeScanned';
  barcode: string;
  item?: InventoryItem;
  timestamp: string;
}
