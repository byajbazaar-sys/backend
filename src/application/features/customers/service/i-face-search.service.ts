import { FaceLibraryStatusModel, FaceLibrarySyncResponseModel, FaceSearchResponseModel } from '../models/face-search.models';

export const FACE_SEARCH_SERVICE = 'IFaceSearchService';

export interface IFaceSearchService {
  getLibraryStatus(userId: string): Promise<FaceLibraryStatusModel>;
  syncLibrary(userId: string): Promise<FaceLibrarySyncResponseModel>;
  searchByPhoto(userId: string, imageBuffer: Buffer): Promise<FaceSearchResponseModel>;
  indexCustomer(userId: string, customerId: string): Promise<void>;
  removeCustomer(userId: string, customerId: string): Promise<void>;
}
