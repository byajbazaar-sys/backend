import { EInventoryItemStatus } from '../enums';
import { UpdateInventoryItemRequestModel } from './update-inventory-item.model';

/** Repository patch for inventory items (API fields + internal-only columns). */
export class InventoryItemUpdatePatch extends UpdateInventoryItemRequestModel {
  qrValue?: string;
  imageUrls?: string[];
  status?: EInventoryItemStatus;
}
