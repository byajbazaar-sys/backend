import { InventoryItem } from '../../inventory/domain';

export interface BarcodeScannedPayload {
  type: 'barcodeScanned';
  barcode: string;
  item?: InventoryItem;
  timestamp: string;
}
