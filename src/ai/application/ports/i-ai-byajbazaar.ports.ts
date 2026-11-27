import type { AiInventoryCardItem } from '../domain';

/**
 * What the assistant needs from ByajBazaar's inventory. Implemented by infrastructure/adapters with the existing
 * inventory services (same validation and rules as the inventory API) — the assistant never touches tables.
 * Every method is scoped to `shopId`, which always comes from the authenticated request.
 */
export const AI_INVENTORY_GATEWAY = 'AI_INVENTORY_GATEWAY';

export interface AiInventoryItem extends AiInventoryCardItem {
  id: string;
  sku: string;
  categoryId?: string | null;
  createdAt?: string | null;
}

export interface AiInventoryWriteInput {
  itemName?: string;
  metalType?: string;
  purity?: string;
  grossWeight?: number;
  netWeight?: number;
  stoneWeight?: number;
  makingCharges?: number;
  makingChargeMode?: string;
  sellingPrice?: number;
  purchasePrice?: number;
  stockQuantity?: number;
  categoryId?: string;
  description?: string;
  huid?: string;
  size?: string;
  hallmarked?: boolean;
  supplierName?: string;
  location?: string;
  status?: string;
}

export interface AiInventorySearch {
  search?: string;
  metalType?: string;
  status?: string;
  purity?: string;
  minWeight?: number;
  maxWeight?: number;
  categoryId?: string;
  limit: number;
}

export interface AiInventorySummary {
  totalItems: number;
  availableItems: number;
  soldItems: number;
  totalValuation: number;
  categories: { name: string; count: number; value: number }[];
}

export interface IAiInventoryGateway {
  /** The shop's categories plus the shared default ones. */
  listCategories(shopId: string): Promise<{ id: string; name: string }[]>;
  /** Throws AiBusinessError when the item breaks an inventory rule. */
  create(shopId: string, input: AiInventoryWriteInput): Promise<AiInventoryItem>;
  update(shopId: string, id: string, patch: AiInventoryWriteInput): Promise<AiInventoryItem>;
  /** null when not found in this shop. */
  get(shopId: string, id: string): Promise<AiInventoryItem | null>;
  search(shopId: string, query: AiInventorySearch): Promise<{ total: number; items: AiInventoryItem[] }>;
  summary(shopId: string): Promise<AiInventorySummary>;
}

/** Business changes made through the assistant also go to ByajBazaar's activity log (logs service). */
export const AI_ACTIVITY_LOG = 'AI_ACTIVITY_LOG';
export interface IAiActivityLog {
  /** Never throws. */
  record(entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    shopId: string;
    performedBy: string;
    channel?: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
}
