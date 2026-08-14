import {
  BulkUpdateCatalogVisibilityResponseModel,
  InventoryCatalogSummaryResponseModel,
  UpdateCatalogSettingsRequestModel,
} from '../models';

export const INVENTORY_CATALOG_SERVICE = 'INVENTORY_CATALOG_SERVICE';

export interface IInventoryCatalogService {
  getSummary(userId: string): Promise<InventoryCatalogSummaryResponseModel>;
  updateSettings(
    userId: string,
    body: UpdateCatalogSettingsRequestModel,
  ): Promise<InventoryCatalogSummaryResponseModel>;
  bulkUpdateVisibility(
    userId: string,
    ids: string[],
    isCatalogVisible: boolean,
  ): Promise<BulkUpdateCatalogVisibilityResponseModel>;
}
