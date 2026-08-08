export interface InventoryReorderSuggestion {
  categoryId: string;
  categoryName: string;
  availableCount: number;
  soldCount: number;
  message: string;
}
