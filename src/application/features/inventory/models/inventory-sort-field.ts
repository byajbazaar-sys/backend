export const INVENTORY_SORT_FIELDS = ['createdAt', 'netWeight', 'sellingPrice', 'itemName'] as const;

export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];
