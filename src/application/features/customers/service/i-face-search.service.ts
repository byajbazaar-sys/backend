import { FaceLibraryStatusModel, FaceLibrarySyncResponseModel, FaceSearchResponseModel } from '../models';
export const FACE_SEARCH_SERVICE = 'IFaceSearchService';

export interface IFaceSearchService {
  getLibraryStatus(userId: string): Promise<FaceLibraryStatusModel>;
  syncLibrary(userId: string): Promise<FaceLibrarySyncResponseModel>;
  searchByPhoto(userId: string, imageBuffer: Buffer): Promise<FaceSearchResponseModel>;
  /**
   * The slow part of indexing (the face embedding), from the photo alone: start it before the customer is saved
   * and pass the result to `indexCustomer`. Null when face search isn't configured.
   */
  embedForIndex(imageBuffer: Buffer): Promise<number[] | null>;
  indexCustomer(userId: string, customerId: string, imageBuffer?: Buffer, vector?: number[]): Promise<void>;
  removeCustomer(userId: string, customerId: string): Promise<void>;
}
