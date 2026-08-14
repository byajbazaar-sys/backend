import { ListPublicCatalogQueryModel, PublicCatalogResponseModel } from '../models';

export const PUBLIC_CATALOG_SERVICE = 'PUBLIC_CATALOG_SERVICE';

export interface IPublicCatalogService {
  getCatalogBySlug(slug: string, query: ListPublicCatalogQueryModel): Promise<PublicCatalogResponseModel>;
}
